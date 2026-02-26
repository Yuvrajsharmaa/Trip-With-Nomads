BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    duration_text TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trip_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transport TEXT,
    sharing TEXT,
    vehicle TEXT
);

CREATE INDEX IF NOT EXISTS idx_trip_pricing_trip_id ON public.trip_pricing (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_pricing_trip_variant ON public.trip_pricing (trip_id, variant_name);
CREATE INDEX IF NOT EXISTS idx_trip_pricing_start_date ON public.trip_pricing (start_date);

CREATE SEQUENCE IF NOT EXISTS public.booking_ref_seq START WITH 1 INCREMENT BY 1 MINVALUE 1;

CREATE OR REPLACE FUNCTION public.generate_booking_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.booking_ref IS NULL OR BTRIM(NEW.booking_ref) = '' THEN
        NEW.booking_ref :=
            'TWN-' ||
            TO_CHAR(COALESCE(NEW.created_at, NOW()), 'YYYY') ||
            '-' ||
            LPAD(NEXTVAL('public.booking_ref_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE RESTRICT,
    departure_date DATE NOT NULL,
    travellers JSONB NOT NULL DEFAULT '[]'::JSONB,
    payment_breakdown JSONB NOT NULL DEFAULT '[]'::JSONB,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_status TEXT NOT NULL DEFAULT 'pending',
    payu_txnid TEXT UNIQUE,
    payu_mihpayid TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    booking_ref TEXT UNIQUE,
    transport TEXT,
    subtotal_amount NUMERIC(12, 2),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    coupon_code TEXT,
    coupon_snapshot JSONB
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bookings_payment_status_check'
    ) THEN
        ALTER TABLE public.bookings
            ADD CONSTRAINT bookings_payment_status_check
            CHECK (payment_status IN ('pending', 'paid', 'failed'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'bookings_generate_booking_ref'
    ) THEN
        CREATE TRIGGER bookings_generate_booking_ref
        BEFORE INSERT ON public.bookings
        FOR EACH ROW
        EXECUTE FUNCTION public.generate_booking_ref();
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_bookings_trip_id ON public.bookings (trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.bookings (payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON public.bookings (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_bookings_payu_txnid ON public.bookings (payu_txnid);

COMMIT;
