import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts"
import { normalizeSharing } from "./pricing.ts"

type PublicTrip = { id?: unknown; active?: unknown }
type CatalogTrip = {
    id?: unknown
    website_trip_id?: unknown
    is_active?: unknown
    title?: unknown
    slug?: unknown
    trip_type?: unknown
    region?: unknown
    billing_entity?: unknown
    is_custom?: unknown
}

export type WebsiteTripCatalog = {
    id: string
    website_trip_id: string | null
    is_active: boolean
    title: string
    slug: string
    trip_type: string | null
    region: string | null
    billing_entity: string | null
    is_custom: boolean
}

export type WebsiteTripDeparture = {
    id: string
    departure_date: string
    start_time: string
    time_zone: string
    status: string
    capacity: number
    reserved_count: number
    unverified_booking_count: number
    pricing_options: unknown[]
}

export type WebsiteTripCatalogPricing = {
    catalogTrip: WebsiteTripCatalog
    departures: WebsiteTripDeparture[]
    pricingRows: Array<Record<string, unknown>>
}

type CatalogQueryRow = WebsiteTripCatalog & {
    departure_id: string
    departure_date: string
    start_time: string
    time_zone: string
    departure_status: string
    capacity: number
    reserved_count: number
    unverified_booking_count: number
    pricing_options: unknown[]
}

let catalogPool: Pool | null = null

function getCatalogPool(): Pool {
    const connectionString = text(Deno.env.get("SUPABASE_DB_URL"))
    if (!connectionString) throw new Error("CRM trip catalogue is unavailable")
    if (!catalogPool) catalogPool = new Pool(connectionString, 2, true)
    return catalogPool
}

function text(value: unknown): string {
    return String(value ?? "").trim()
}

export function mapWebsiteTripCatalogRow(row: CatalogTrip): WebsiteTripCatalog {
    return {
        id: text(row.id),
        website_trip_id: text(row.website_trip_id) || null,
        is_active: row.is_active === true,
        title: text(row.title),
        slug: text(row.slug),
        trip_type: text(row.trip_type) || null,
        region: text(row.region) || null,
        billing_entity: text(row.billing_entity) || null,
        is_custom: row.is_custom === true,
    }
}

function positiveAmount(value: unknown): number | null {
    const amount = Number(value)
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

function amountMinor(value: number): number | null {
    const minor = Math.round(value * 100)
    return Number.isFinite(value) && Number.isSafeInteger(minor) && Math.abs(value * 100 - minor) < 0.000001
        ? minor
        : null
}

function validDateKey(value: unknown): string {
    const date = text(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ""
    const parsed = new Date(`${date}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
        ? date
        : ""
}

function endOfIndiaDayUtc(date: string): string {
    return new Date(`${date}T23:59:59.999+05:30`).toISOString()
}

export function resolveWebsiteTripCatalog<T extends CatalogTrip>(
    publicTrip: PublicTrip,
    catalogTrips: T[],
): T | null {
    const publicId = text(publicTrip.id)
    if (!publicId || publicTrip.active !== true) return null

    const matches = catalogTrips.filter((trip) => {
        if (trip.is_active !== true || trip.is_custom === true) return false
        const mappedWebsiteId = text(trip.website_trip_id)
        return mappedWebsiteId
            ? mappedWebsiteId === publicId
            : text(trip.id) === publicId
    })

    return matches.length === 1 ? matches[0] : null
}

export function resolveWebsiteFinanceIssuer(catalogTrip: CatalogTrip): "TWN" | "NTC" | null {
    const entity = text(catalogTrip.billing_entity).toUpperCase()
    if (entity === "TWN" || entity === "NTC") return entity
    const category = text(catalogTrip.region || catalogTrip.trip_type).toLowerCase()
    if (category === "domestic") return "TWN"
    if (category === "international") return "NTC"
    return null
}

/** Reads Operations-owned rates and the same seat holds checked by the CRM booking trigger. */
export async function loadWebsiteTripCatalogPricing(
    publicTripId: string,
): Promise<WebsiteTripCatalogPricing | null> {
    const pool = getCatalogPool()
    const client = await pool.connect()
    try {
        const result = await client.queryObject<CatalogQueryRow>`
            select
              catalog.id::text as id,
              catalog.website_trip_id::text as website_trip_id,
              catalog.is_active,
              catalog.title,
              catalog.slug,
              catalog.trip_type,
              catalog.region,
              catalog.billing_entity,
              catalog.is_custom,
              departure.id::text as departure_id,
              departure.departure_date::text as departure_date,
              departure.start_time::text as start_time,
              departure.time_zone,
              departure.status as departure_status,
              departure.capacity,
              departure.pricing_options,
              coalesce(occupied.reserved_count, 0)::integer as reserved_count,
              coalesce(occupied.unverified_booking_count, 0)::integer as unverified_booking_count
            from crm.trips_catalog as catalog
            join crm.trip_departures as departure
              on departure.trip_catalog_id = catalog.id
            left join lateral (
              select
                coalesce(sum(booked.passenger_count) filter (where booked.passenger_count > 0), 0)::integer as reserved_count,
                count(*) filter (where booked.passenger_count < 1)::integer as unverified_booking_count
              from (
                select greatest(
                  case
                    when jsonb_typeof(booking.travellers) = 'array'
                      then jsonb_array_length(booking.travellers)
                    else 0
                  end,
                  coalesce(traveller_audit.confirmed_count, 0)
                )::integer as passenger_count
                from public.bookings as booking
                left join crm.booking_details as booking_details
                  on booking_details.booking_id = booking.id
                left join lateral (
                  select audit.confirmed_count
                  from crm.booking_traveller_audit as audit
                  where audit.booking_id = booking.id
                    and audit.confirmed_count is not null
                  order by audit.created_at desc, audit.id desc
                  limit 1
                ) as traveller_audit on true
                where booking.departure_date = departure.departure_date
                  and (
                    booking.trip_id in (catalog.id, catalog.website_trip_id)
                    or booking_details.trip_catalog_id = catalog.id
                  )
                  and lower(coalesce(booking.status, '')) not in ('cancelled', 'canceled', 'failed')
                  and lower(coalesce(booking.payment_status, '')) not in ('cancelled', 'canceled', 'failed')
                  and (
                    lower(coalesce(booking.status, '')) = 'confirmed'
                    or lower(coalesce(booking.payment_status, '')) in ('paid', 'partially_paid')
                    or exists (
                      select 1
                      from public.payment_attempts as attempt
                      where attempt.booking_id = booking.id
                        and lower(attempt.status) = 'pending'
                        and attempt.expires_at > now()
                    )
                  )
              ) as booked
            ) as occupied on true
            where catalog.is_active is true
              and catalog.is_custom is not true
              and (
                catalog.website_trip_id = ${publicTripId}::uuid
                or (catalog.website_trip_id is null and catalog.id = ${publicTripId}::uuid)
              )
              and departure.status = 'open'
              and (departure.departure_date + departure.start_time) at time zone departure.time_zone > now()
            order by departure.departure_date, departure.start_time
        `

        const rows = result.rows
        const catalogIds = new Set(rows.map((row) => row.id))
        if (catalogIds.size !== 1) return null

        const first = rows[0]
        const catalogTrip = mapWebsiteTripCatalogRow(first)
        const departures: WebsiteTripDeparture[] = rows.map((row) => ({
            id: row.departure_id,
            departure_date: row.departure_date,
            start_time: row.start_time,
            time_zone: row.time_zone,
            status: row.departure_status,
            capacity: Number(row.capacity),
            reserved_count: Number(row.reserved_count),
            unverified_booking_count: Number(row.unverified_booking_count),
            pricing_options: Array.isArray(row.pricing_options) ? row.pricing_options : [],
        }))

        const pricingRows = buildWebsiteTripPricingRows({
            publicTripId,
            today: new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(new Date()),
            catalogTrip,
            departures,
        })

        return { catalogTrip, departures, pricingRows }
    } catch (error) {
        console.error("[crm-trip-catalog] read failed", error)
        throw new Error("Could not load the current Operations trip prices")
    } finally {
        client.release()
    }
}

export function buildWebsiteTripPricingRows(input: {
    publicTripId: string
    today: string
    catalogTrip: CatalogTrip
    departures: Array<{
        id?: unknown
        departure_date?: unknown
        status?: unknown
        capacity?: unknown
        reserved_count?: unknown
        unverified_booking_count?: unknown
        pricing_options?: unknown
    }>
}) {
    const publicTripId = text(input.publicTripId)
    const mappedWebsiteId = text(input.catalogTrip.website_trip_id)
    const catalogId = text(input.catalogTrip.id)
    const legacySameId = !mappedWebsiteId && catalogId === publicTripId
    if (
        input.catalogTrip.is_active !== true ||
        input.catalogTrip.is_custom === true ||
        !publicTripId ||
        !(mappedWebsiteId === publicTripId || legacySameId)
    ) return []

    const today = validDateKey(input.today)
    if (!today) return []

    const openDepartureDates = new Map<string, number>()
    for (const departure of input.departures) {
        const date = validDateKey(departure.departure_date)
        if (text(departure.status).toLowerCase() !== "open" || !date || date < today) continue
        openDepartureDates.set(date, (openDepartureDates.get(date) || 0) + 1)
    }

    const rows: Array<Record<string, unknown>> = []
    for (const departure of input.departures) {
        const departureDate = validDateKey(departure.departure_date)
        const capacity = Number(departure.capacity)
        const reservedCount = Number(departure.reserved_count)
        const unverifiedBookingCount = Number(departure.unverified_booking_count ?? 0)
        if (
            text(departure.status).toLowerCase() !== "open" ||
            !departureDate || departureDate < today ||
            openDepartureDates.get(departureDate) !== 1 ||
            !Number.isSafeInteger(capacity) || capacity < 1 ||
            !Number.isSafeInteger(reservedCount) || reservedCount < 0 ||
            !Number.isSafeInteger(unverifiedBookingCount) || unverifiedBookingCount !== 0 ||
            reservedCount >= capacity ||
            !Array.isArray(departure.pricing_options)
        ) continue

        const optionCounts = new Map<string, number>()
        for (const option of departure.pricing_options) {
            if (!option || typeof option !== "object" || Array.isArray(option)) continue
            const rate = option as Record<string, unknown>
            const sharing = normalizeSharing(rate.sharing)
            const transport = text(rate.transport).replace(/\s+/g, " ")
            if (!sharing || !transport) continue
            const key = `${sharing.toLowerCase()}\u0000${transport.toLowerCase()}`
            optionCounts.set(key, (optionCounts.get(key) || 0) + 1)
        }

        for (const option of departure.pricing_options) {
            if (!option || typeof option !== "object" || Array.isArray(option)) continue
            const rate = option as Record<string, unknown>
            const sharing = normalizeSharing(rate.sharing)
            const transport = text(rate.transport).replace(/\s+/g, " ")
            const price = positiveAmount(rate.price)
            if (!sharing || !transport || !price) continue
            const key = `${sharing.toLowerCase()}\u0000${transport.toLowerCase()}`
            if (optionCounts.get(key) !== 1) continue

            const earlyBirdPrice = positiveAmount(rate.earlyBirdPrice)
            const earlyBirdEndDate = validDateKey(rate.earlyBirdEndsOn)
            const hasEarlyBird = Boolean(
                earlyBirdPrice && earlyBirdPrice < price && earlyBirdEndDate &&
                earlyBirdEndDate >= today,
            )

            rows.push({
                trip_id: publicTripId,
                crm_trip_id: catalogId,
                departure_id: text(departure.id),
                start_date: departureDate,
                departure_date: departureDate,
                sharing,
                vehicle: transport,
                transport,
                price,
                early_bird_enabled: hasEarlyBird,
                early_bird_discount_type: "fixed",
                early_bird_discount_value: hasEarlyBird ? price - earlyBirdPrice! : 0,
                early_bird_ends_at: hasEarlyBird
                    ? endOfIndiaDayUtc(earlyBirdEndDate)
                    : null,
                capacity,
                remaining_capacity: capacity - reservedCount,
            })
        }
    }

    return rows
}

export function validateWebsiteDepartureSelection(
    pricingRows: Array<Record<string, unknown>>,
    departureDate: string,
    passengerCount: number,
): { valid: true; departureId: string } | { valid: false; reason: "invalid_passengers" | "unavailable" | "ambiguous" | "capacity" } {
    if (!Number.isSafeInteger(passengerCount) || passengerCount < 1 || passengerCount > 50) {
        return { valid: false, reason: "invalid_passengers" }
    }

    const matches = pricingRows.filter((row) => text(row.departure_date || row.start_date) === departureDate)
    if (matches.length === 0) return { valid: false, reason: "unavailable" }

    const departureIds = new Set(matches.map((row) => text(row.departure_id)).filter(Boolean))
    const remainingCapacity = new Set(matches.map((row) => Number(row.remaining_capacity)))
    if (departureIds.size !== 1 || remainingCapacity.size !== 1 || remainingCapacity.has(NaN)) {
        return { valid: false, reason: "ambiguous" }
    }

    const available = [...remainingCapacity][0]
    if (!Number.isSafeInteger(available) || available < passengerCount) {
        return { valid: false, reason: "capacity" }
    }

    return { valid: true, departureId: [...departureIds][0] }
}

/** Captures the exact Operations rates selected at checkout for CRM booking history. */
export function buildWebsiteCommercialSnapshot(input: {
    departureDate: string
    lineItems: Array<{ traveller_id: number; sharing: string; transport: string; unit_price: number }>
    pricingRows: Array<Record<string, unknown>>
    nowMs?: number
}) {
    const departureDate = validDateKey(input.departureDate)
    if (!departureDate || !Array.isArray(input.lineItems) || input.lineItems.length < 1 || input.lineItems.length > 50) {
        return null
    }

    const nowMs = input.nowMs ?? Date.now()
    const groups = new Map<string, {
        transport: string
        sharing: string
        travellerCount: number
        unitPriceMinor: number
        discountPerTravellerMinor: number
    }>()

    for (const item of input.lineItems) {
        const sharing = normalizeSharing(item.sharing)
        const transport = text(item.transport).replace(/\s+/g, " ")
        const unitPrice = Number(item.unit_price)
        const unitPriceMinor = amountMinor(unitPrice)
        if (!sharing || !transport || unitPriceMinor == null || unitPriceMinor <= 0) return null

        const matches = input.pricingRows.filter((row) =>
            validDateKey(row.departure_date || row.start_date) === departureDate &&
            normalizeSharing(row.sharing) === sharing &&
            text(row.transport || row.vehicle).replace(/\s+/g, " ").toLowerCase() === transport.toLowerCase() &&
            Number(row.price) === unitPrice
        )
        if (matches.length !== 1) return null
        const row = matches[0]

        let discountPerTraveller = 0
        if (row.early_bird_enabled === true) {
            const startsAtRaw = text(row.early_bird_starts_at)
            const endsAtRaw = text(row.early_bird_ends_at)
            const startsAt = startsAtRaw ? Date.parse(startsAtRaw) : null
            const endsAt = endsAtRaw ? Date.parse(endsAtRaw) : null
            const datesValid = (startsAtRaw === "" || Number.isFinite(startsAt)) &&
                (endsAtRaw === "" || Number.isFinite(endsAt))
            if (datesValid && (startsAt == null || nowMs >= startsAt) && (endsAt == null || nowMs <= endsAt)) {
                const discountValue = Number(row.early_bird_discount_value)
                const discountType = text(row.early_bird_discount_type).toLowerCase()
                const candidate = discountType === "percent"
                    ? unitPrice * discountValue / 100
                    : discountType === "fixed"
                    ? discountValue
                    : 0
                const maxDiscount = row.early_bird_max_discount == null ? null : Number(row.early_bird_max_discount)
                const cappedDiscount = maxDiscount != null && Number.isFinite(maxDiscount) && maxDiscount > 0
                    ? Math.min(candidate, maxDiscount)
                    : candidate
                discountPerTraveller = Math.max(0, Math.min(unitPrice, cappedDiscount))
            }
        }

        const discountPerTravellerMinor = amountMinor(discountPerTraveller)
        if (discountPerTravellerMinor == null || discountPerTravellerMinor > unitPriceMinor) return null
        const key = `${transport.toLowerCase()}\u0000${sharing.toLowerCase()}`
        const group = groups.get(key)
        if (group) {
            if (group.unitPriceMinor !== unitPriceMinor || group.discountPerTravellerMinor !== discountPerTravellerMinor) return null
            group.travellerCount += 1
        } else {
            groups.set(key, { transport, sharing, travellerCount: 1, unitPriceMinor, discountPerTravellerMinor })
        }
    }

    const options = [...groups.values()].map((group) => {
        const subtotalBeforeDiscountMinor = group.unitPriceMinor * group.travellerCount
        const discountAmountMinor = group.discountPerTravellerMinor * group.travellerCount
        if (!Number.isSafeInteger(subtotalBeforeDiscountMinor) || !Number.isSafeInteger(discountAmountMinor)) return null
        return {
            ...group,
            subtotalBeforeDiscountMinor,
            discountAmountMinor,
            subtotalAfterDiscountMinor: subtotalBeforeDiscountMinor - discountAmountMinor,
        }
    })
    if (options.some((option) => option === null)) return null

    const safeOptions = options as Array<NonNullable<(typeof options)[number]>>
    const catalogueSubtotalMinor = safeOptions.reduce((sum, option) => sum + option.subtotalAfterDiscountMinor, 0)
    if (!Number.isSafeInteger(catalogueSubtotalMinor) || catalogueSubtotalMinor <= 0) return null

    return {
        version: 1 as const,
        source: "operations_departure" as const,
        currency: "INR" as const,
        departureDate,
        options: safeOptions.map(({ transport, sharing, travellerCount, unitPriceMinor, discountPerTravellerMinor, subtotalBeforeDiscountMinor, discountAmountMinor, subtotalAfterDiscountMinor }) => ({
            transport,
            sharing,
            travellerCount,
            unitPriceMinor,
            discountPerTravellerMinor,
            subtotalBeforeDiscountMinor,
            discountAmountMinor,
            subtotalAfterDiscountMinor,
        })),
        catalogueSubtotalMinor,
        sellingSubtotalMinor: catalogueSubtotalMinor,
        manualAdjustmentMinor: 0,
    }
}
