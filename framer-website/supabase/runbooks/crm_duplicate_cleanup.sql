begin;

create temporary table if not exists tmp_lead_survivors as
with ranked as (
  select
    id,
    normalized_email,
    normalized_phone,
    crm_status,
    created_at,
    coalesce(normalized_email, normalized_phone) as identity_key,
    row_number() over (
      partition by coalesce(normalized_email, normalized_phone)
      order by
        case when crm_status in ('won','dropped','archived') then 1 else 0 end,
        created_at asc,
        id asc
    ) as rn
  from public.leads
  where coalesce(normalized_email, normalized_phone) is not null
), dupes as (
  select * from ranked where rn > 1
)
select d.id as duplicate_lead_id, s.id as survivor_lead_id
from dupes d
join ranked s
  on s.identity_key = d.identity_key
 and s.rn = 1;

-- re-link known dependent records
update crm.lead_notes n
set lead_id = m.survivor_lead_id
from tmp_lead_survivors m
where n.lead_id = m.duplicate_lead_id;

update crm.lead_activity a
set lead_id = m.survivor_lead_id
from tmp_lead_survivors m
where a.lead_id = m.duplicate_lead_id;

-- delete shadows
delete from public.leads l
using tmp_lead_survivors m
where l.id = m.duplicate_lead_id;

commit;
