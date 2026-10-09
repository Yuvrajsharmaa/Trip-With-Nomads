-- A phone number can be shared by family members, assistants, or a group.
-- Normalized email is the current-contact identity key; phone is captured data,
-- not a uniqueness constraint that can strand a legitimate lead submission.
drop index if exists public.leads_active_normalized_phone_uidx;

create index if not exists leads_normalized_phone_idx
    on public.leads (normalized_phone)
    where normalized_phone is not null and btrim(normalized_phone) <> '';
