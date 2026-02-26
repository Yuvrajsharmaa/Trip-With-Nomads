# On-Site Balance Collection Checklist

## Scope
Use this only for bookings where:
- `payment_mode = partial_25`
- `settlement_status = partially_paid`
- `due_amount > 0`

## At Check-in
1. Verify booking id and traveller identity.
2. Collect full `due_amount` (cash/UPI).
3. Confirm amount matches Supabase `bookings.due_amount`.

## Supabase Update
Run in SQL editor:

```sql
update public.bookings
set
  due_amount = 0,
  paid_amount = coalesce(total_amount, paid_amount),
  settlement_status = 'fully_paid',
  balance_collected_at = now(),
  balance_collected_by = '<ops-person-name>',
  balance_due_note = null
where id = '<booking-uuid>';
```

## Guardrails
- Do not edit `payment_mode`.
- Do not overwrite `payu_txnid`/gateway fields.
- If partial amount is collected, record note externally and do not mark `fully_paid` until total due is cleared.
