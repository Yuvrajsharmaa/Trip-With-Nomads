begin;

alter table public.payment_attempts
    add column if not exists superseded_payment_ids text[] not null default '{}';

create or replace function public.reconcile_website_payment_failure(
    p_booking_id uuid,
    p_attempt_id uuid,
    p_event_id text,
    p_order_id text,
    p_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_attempt public.payment_attempts%rowtype;
    v_booking public.bookings%rowtype;
    v_now timestamptz := pg_catalog.now();
    v_result text;
    v_paid boolean;
    v_older_attempt boolean;
begin
    -- Lock in attempt-then-booking order so retry activation cannot interleave with a failure transition.
    select *
      into v_attempt
      from public.payment_attempts
     where id = p_attempt_id
       and booking_id = p_booking_id
     for update;
    if not found then
        raise exception 'Payment attempt does not belong to the booking';
    end if;

    select *
      into v_booking
      from public.bookings
     where id = p_booking_id
     for update;
    if not found then
        raise exception 'Booking was not found';
    end if;

    if nullif(pg_catalog.btrim(coalesce(p_payment_id, '')), '') is not null
       and (
           coalesce(v_attempt.superseded_payment_ids, '{}'::text[]) @> array[p_payment_id]
           or (
               pg_catalog.lower(coalesce(v_attempt.status, '')) = 'pending'
               and v_attempt.provider_payment_id = p_payment_id
           )
       ) then
        return pg_catalog.jsonb_build_object(
            'booking', pg_catalog.to_jsonb(v_booking),
            'attempt', pg_catalog.to_jsonb(v_attempt),
            'reconciliation_result', 'ignored_superseded_payment_failure'
        );
    end if;

    if pg_catalog.lower(coalesce(v_attempt.status, '')) <> 'paid' then
        update public.payment_attempts
           set provider_order_id = coalesce(nullif(p_order_id, ''), provider_order_id),
               provider_payment_id = coalesce(nullif(p_payment_id, ''), provider_payment_id),
               status = 'failed',
               failed_at = v_now,
               updated_at = v_now
         where id = p_attempt_id
        returning * into v_attempt;
    end if;

    v_paid := pg_catalog.lower(coalesce(v_booking.payment_status, '')) in ('paid', 'succeeded')
        or pg_catalog.lower(coalesce(v_attempt.status, '')) = 'paid';
    v_older_attempt := v_booking.active_payment_attempt_id is not null
        and v_booking.active_payment_attempt_id <> p_attempt_id;

    if v_paid then
        v_result := 'ignored_failure_after_paid';
        update public.bookings
           set last_payment_event_id = p_event_id,
               last_payment_event_at = v_now
         where id = p_booking_id
        returning * into v_booking;
    elsif v_older_attempt then
        v_result := 'ignored_older_attempt_failure';
        update public.bookings
           set last_payment_event_id = p_event_id,
               last_payment_event_at = v_now
         where id = p_booking_id
        returning * into v_booking;
    else
        v_result := 'failure_applied';
        update public.bookings
           set payment_status = 'failed',
               settlement_status = 'failed',
               payment_provider = 'razorpay',
               payment_gateway_order_or_ref_id = coalesce(nullif(p_order_id, ''), null),
               payment_gateway_payment_id = nullif(p_payment_id, ''),
               payment_gateway_txn_id = coalesce(nullif(p_payment_id, ''), nullif(p_order_id, '')),
               active_payment_attempt_id = v_attempt.id,
               payment_attempt_number = v_attempt.attempt_no,
               last_payment_event_id = p_event_id,
               last_payment_event_at = v_now
         where id = p_booking_id
        returning * into v_booking;
    end if;

    return pg_catalog.jsonb_build_object(
        'booking', pg_catalog.to_jsonb(v_booking),
        'attempt', pg_catalog.to_jsonb(v_attempt),
        'reconciliation_result', v_result
    );
end;
$$;

revoke all on function public.reconcile_website_payment_failure(uuid, uuid, text, text, text)
    from public, anon, authenticated;
grant execute on function public.reconcile_website_payment_failure(uuid, uuid, text, text, text)
    to service_role;

commit;
