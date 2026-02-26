BEGIN;

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'full',
    ADD COLUMN IF NOT EXISTS payable_now_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS due_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS balance_collection_mode TEXT NOT NULL DEFAULT 'on_site_pre_departure',
    ADD COLUMN IF NOT EXISTS balance_due_note TEXT,
    ADD COLUMN IF NOT EXISTS balance_collected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS balance_collected_by TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bookings_payment_mode_check'
    ) THEN
        ALTER TABLE public.bookings
            ADD CONSTRAINT bookings_payment_mode_check
            CHECK (payment_mode IN ('full', 'partial_25'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bookings_settlement_status_check'
    ) THEN
        ALTER TABLE public.bookings
            ADD CONSTRAINT bookings_settlement_status_check
            CHECK (settlement_status IN ('pending', 'failed', 'partially_paid', 'fully_paid'));
    END IF;
END;
$$;

UPDATE public.bookings
SET
    payment_mode = CASE
        WHEN payment_mode IN ('full', 'partial_25') THEN payment_mode
        ELSE 'full'
    END,
    payable_now_amount = CASE
        WHEN payment_status = 'paid' THEN COALESCE(total_amount, 0)
        ELSE COALESCE(payable_now_amount, 0)
    END,
    paid_amount = CASE
        WHEN payment_status = 'paid' THEN COALESCE(total_amount, 0)
        WHEN payment_status = 'failed' THEN 0
        ELSE COALESCE(paid_amount, 0)
    END,
    due_amount = CASE
        WHEN payment_status = 'paid' THEN 0
        WHEN payment_status = 'failed' THEN COALESCE(total_amount, 0)
        ELSE COALESCE(due_amount, COALESCE(total_amount, 0))
    END,
    settlement_status = CASE
        WHEN payment_status = 'paid' THEN 'fully_paid'
        WHEN payment_status = 'failed' THEN 'failed'
        ELSE 'pending'
    END,
    balance_collection_mode = COALESCE(NULLIF(balance_collection_mode, ''), 'on_site_pre_departure'),
    balance_due_note = CASE
        WHEN payment_status = 'paid' THEN NULL
        ELSE COALESCE(balance_due_note, 'Balance payable on-site before trip departure.')
    END
WHERE TRUE;

COMMIT;
