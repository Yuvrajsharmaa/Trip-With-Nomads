create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.checkout_reminder_sequences (
    id uuid primary key default gen_random_uuid(),
    normalized_email text not null unique,
    lead_submission_id uuid not null references public.lead_submissions(id) on delete cascade,
    trip_id uuid not null,
    trip_slug text not null,
    trip_name text not null default '',
    status text not null default 'pending'
        check (status in ('pending', 'sending', 'complete', 'suppressed', 'unsubscribed', 'failed')),
    sent_count integer not null default 0 check (sent_count between 0 and 2),
    attempt_count integer not null default 0 check (attempt_count between 0 and 3),
    next_send_at timestamptz not null,
    last_sent_at timestamptz,
    lease_expires_at timestamptz,
    unsubscribe_token uuid not null default gen_random_uuid() unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists checkout_reminder_due_idx
    on public.checkout_reminder_sequences (next_send_at)
    where status in ('pending', 'sending');

alter table public.checkout_reminder_sequences enable row level security;
revoke all on public.checkout_reminder_sequences from public, anon, authenticated;
grant all on public.checkout_reminder_sequences to service_role;

create or replace function public.enqueue_checkout_reminder()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
    contact_email text := lower(trim(coalesce(new.normalized_email, '')));
    captured_trip_id text := trim(coalesce(new.payload ->> 'trip_id', ''));
    captured_slug text := lower(trim(coalesce(new.payload ->> 'trip_slug', '')));
    captured_at timestamptz := coalesce(new.created_at, now());
begin
    if new.source <> 'booking_abandoned'
       or new.status <> 'abandoned_booking'
       or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or captured_trip_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or captured_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        return new;
    end if;

    begin
        insert into public.checkout_reminder_sequences (
            normalized_email,
            lead_submission_id,
            trip_id,
            trip_slug,
            trip_name,
            next_send_at
        ) values (
            contact_email,
            new.id,
            captured_trip_id::uuid,
            captured_slug,
            left(trim(coalesce(new.payload ->> 'trip_name', '')), 160),
            captured_at + interval '20 minutes'
        )
        on conflict (normalized_email) do update set
            lead_submission_id = excluded.lead_submission_id,
            trip_id = excluded.trip_id,
            trip_slug = excluded.trip_slug,
            trip_name = excluded.trip_name,
            status = 'pending',
            sent_count = 0,
            attempt_count = 0,
            next_send_at = excluded.next_send_at,
            last_sent_at = null,
            lease_expires_at = null,
            unsubscribe_token = gen_random_uuid(),
            created_at = excluded.created_at,
            updated_at = now()
        where public.checkout_reminder_sequences.status in ('complete', 'suppressed', 'failed')
          and coalesce(
              public.checkout_reminder_sequences.last_sent_at,
              public.checkout_reminder_sequences.created_at
          ) <= now() - interval '30 days';
    exception when others then
        raise warning 'checkout reminder enqueue failed with sqlstate %', sqlstate;
    end;

    return new;
end;
$function$;

revoke all on function public.enqueue_checkout_reminder() from public, anon, authenticated;

drop trigger if exists enqueue_checkout_reminder_after_lead_capture on public.lead_submissions;
create trigger enqueue_checkout_reminder_after_lead_capture
after insert on public.lead_submissions
for each row execute function public.enqueue_checkout_reminder();

create or replace function public.claim_due_checkout_reminder()
returns setof public.checkout_reminder_sequences
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
    update public.checkout_reminder_sequences
       set status = 'failed',
           lease_expires_at = null,
           updated_at = now()
     where status = 'sending'
       and lease_expires_at <= now()
       and attempt_count >= 3;

    return query
    with due as (
        select id
        from public.checkout_reminder_sequences
        where (status = 'pending' and next_send_at <= now())
           or (status = 'sending' and lease_expires_at <= now() and attempt_count < 3)
        order by next_send_at, created_at
        for update skip locked
        limit 1
    )
    update public.checkout_reminder_sequences as sequence
       set status = 'sending',
           attempt_count = least(sequence.attempt_count + 1, 3),
           lease_expires_at = now() + interval '10 minutes',
           updated_at = now()
      from due
     where sequence.id = due.id
    returning sequence.*;
end;
$function$;

create or replace function public.checkout_reminder_has_booking(
    target_email text,
    abandoned_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.bookings as booking
        where lower(trim(booking.email)) = lower(trim(target_email))
          and (
              booking.created_at >= abandoned_at
              or booking.last_payment_event_at >= abandoned_at
          )
          and lower(coalesce(booking.payment_status, '')) = 'paid'
    );
$function$;

create or replace function public.invoke_checkout_reminder_worker()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $function$
declare
    project_url text;
    cron_secret text;
begin
    select decrypted_secret into project_url
    from vault.decrypted_secrets
    where name = 'checkout_reminder_project_url'
    limit 1;

    select decrypted_secret into cron_secret
    from vault.decrypted_secrets
    where name = 'checkout_reminder_cron_secret'
    limit 1;

    if coalesce(project_url, '') = '' or coalesce(cron_secret, '') = '' then
        return;
    end if;

    perform net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/checkout-reminders',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-checkout-reminder-secret', cron_secret
        ),
        body := '{}'::jsonb
    );
end;
$function$;

revoke all on function public.claim_due_checkout_reminder() from public, anon, authenticated;
revoke all on function public.checkout_reminder_has_booking(text, timestamptz) from public, anon, authenticated;
revoke all on function public.invoke_checkout_reminder_worker() from public, anon, authenticated;
grant execute on function public.claim_due_checkout_reminder() to service_role;
grant execute on function public.checkout_reminder_has_booking(text, timestamptz) to service_role;

do $schedule$
declare
    existing_job bigint;
begin
    select jobid into existing_job
      from cron.job
     where jobname = 'twn-checkout-reminders';
    if existing_job is not null then
        perform cron.unschedule(existing_job);
    end if;
    perform cron.schedule(
        'twn-checkout-reminders',
        '* * * * *',
        'select public.invoke_checkout_reminder_worker()'
    );
end;
$schedule$;
