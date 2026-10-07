import React, { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { RenderTarget } from "framer"
import type { ComponentType } from "react"

const POPUP_DELAY_MS = 15_000
const DISMISS_COOLDOWN_HOURS = 24
const STORAGE_KEY = "twn_waitlist_popup_v2"

const SHOW_EVENT = "twn:popup:show"
const CLOSE_EVENT = "twn:popup:close"

const TIMER_KEY = "__twn_popup_timer_started"
const TIMER_AT_KEY = "__twn_popup_timer_started_at"
const SUBMIT_LOCK_KEY = "__twn_popup_submit_lock"

const PROD_PROJECT_REF = "jxozzvwvprmnhvafmpsa"
const STAGING_PROJECT_REF = "ieuwiinbvbdvjrdqqzlb"

type PopupState = {
    submitted?: boolean
    closedAt?: number
}

function readPopupState(): PopupState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? (JSON.parse(raw) as PopupState) : {}
    } catch {
        return {}
    }
}

function writePopupState(data: PopupState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function shouldShowPopup(): boolean {
    const state = readPopupState()
    if (state.submitted) return false
    if (!state.closedAt) return true
    const cooldownMs = DISMISS_COOLDOWN_HOURS * 60 * 60 * 1000
    return Date.now() - state.closedAt > cooldownMs
}

function markClosed() {
    writePopupState({ closedAt: Date.now() })
}

function markSubmitted() {
    writePopupState({ submitted: true, closedAt: Date.now() })
}

function emitShow() {
    window.dispatchEvent(new CustomEvent(SHOW_EVENT))
}

function emitClose() {
    window.dispatchEvent(new CustomEvent(CLOSE_EVENT))
}

function onEvent(name: string, callback: () => void) {
    window.addEventListener(name, callback)
    return () => window.removeEventListener(name, callback)
}

function normalizeEmail(value: string): string {
    return String(value || "").trim().toLowerCase()
}

function createSubmissionId(): string {
    if (
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID()
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        (character) => {
            const random = (Math.random() * 16) | 0
            const value = character === "x" ? random : (random & 0x3) | 0x8
            return value.toString(16)
        },
    )
}

function getSubmissionId(
    source: string,
    form: HTMLFormElement | null,
): { id: string; key: string } {
    const formIdentity = form?.id || form?.getAttribute("name") || "default"
    const key = `__twn_lead_submission_v1:${source}:${window.location.pathname}:${formIdentity}`
    try {
        const existing = sessionStorage.getItem(key)
        if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
            return { id: existing, key }
        }
        const id = createSubmissionId()
        sessionStorage.setItem(key, id)
        return { id, key }
    } catch {
        return { id: createSubmissionId(), key }
    }
}

function clearSubmissionId(key: string) {
    try {
        sessionStorage.removeItem(key)
    } catch {
        // Storage is an enhancement; the server still owns idempotency.
    }
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function findInputValue(root: ParentNode | null, selectors: string[]): string {
    if (!root) return ""
    for (const selector of selectors) {
        const node = root.querySelector(selector) as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null
        if (node && String(node.value || "").trim()) {
            return String(node.value || "").trim()
        }
    }
    return ""
}

function getProjectRefFromHost(): string {
    const host = String(window.location.hostname || "").toLowerCase()
    if (host.includes(".framer.app") || host.includes("staging")) {
        return STAGING_PROJECT_REF
    }
    return PROD_PROJECT_REF
}

async function postLead(
    form: HTMLFormElement | null,
    statusOverride?: string,
): Promise<boolean> {
    const root = form ?? document
    const email = normalizeEmail(
        findInputValue(root, [
            'input[type="email"]',
            'input[name="email"]',
            'input[name*="email" i]',
            'input[placeholder*="email" i]',
        ]),
    )
    const isPartialFill = statusOverride === "partial_fill"
    if ((!email && !isPartialFill) || (email && !isValidEmail(email))) {
        console.warn("[Popup] Submit blocked by validation; state not persisted")
        form?.reportValidity?.()
        return false
    }

    const name = findInputValue(root, [
        'input[name="name"]',
        'input[name*="name" i]',
        'input[placeholder*="name" i]',
    ])
    const phone = findInputValue(root, [
        'input[type="tel"]',
        'input[name="phone"]',
        'input[name*="phone" i]',
        'input[placeholder*="phone" i]',
    ])
    const country_code = findInputValue(root, [
        'select[name*="country" i]',
        'input[name="country_code"]',
        'input[name*="country" i]',
        'input[name*="dial" i]',
    ])
    const instagram_id = findInputValue(root, [
        'input[name="instagram"]',
        'input[name*="instagram" i]',
        'input[placeholder*="instagram" i]',
        'input[name="instagram_id"]',
        'input[name*="insta" i]',
        'input[placeholder*="insta" i]',
    ])
    const reason = findInputValue(root, [
        'textarea[name="reason"]',
        'textarea[name*="reason" i]',
        'textarea[placeholder*="reason" i]',
        'textarea[name*="why" i]',
        'textarea[placeholder*="why" i]',
        'input[name="reason"]',
        'input[name*="reason" i]',
        'input[placeholder*="why" i]',
    ])

    const params = new URLSearchParams(window.location.search)
    const projectRef = getProjectRefFromHost()
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/record-lead`
    const submission = getSubmissionId("waitlist_popup", form)

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                submission_id: submission.id,
                email,
                name: name || null,
                phone: phone || null,
                country_code: country_code || null,
                instagram_id: instagram_id || null,
                reason: reason || null,
                source: "waitlist_popup",
                status: statusOverride || "submitted",
                page_url: window.location.href,
                trip_id: params.get("tripId"),
                trip_slug: params.get("slug"),
                utm_source: params.get("utm_source"),
                utm_medium: params.get("utm_medium"),
                utm_campaign: params.get("utm_campaign"),
                utm_term: params.get("utm_term"),
                utm_content: params.get("utm_content"),
            }),
            keepalive: true,
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload?.ok !== true) {
            console.error("[Popup] Lead capture failed", {
                status: response.status,
                payload,
            })
            if (response.status === 409 && payload?.code === "IDEMPOTENCY_CONFLICT") {
                clearSubmissionId(submission.key)
            }
            return false
        }

        console.log("[Popup] Lead captured", {
            leadId: payload?.lead_id,
            sheetLogged: payload?.sheet_logged,
        })
        clearSubmissionId(submission.key)
        return true
    } catch (error) {
        console.error("[Popup] Lead capture request failed", error)
        return false
    }
}

export function withPopupOverlay(Component: ComponentType): ComponentType {
    return function PopupOverlay(props: any) {
        const [domReady, setDomReady] = useState(false)
        const [isVisible, setIsVisible] = useState(false)
        const [isClosing, setIsClosing] = useState(false)

        useEffect(() => setDomReady(true), [])

        const handleClose = useCallback(() => {
            if (isClosing) return
            setIsClosing(true)
            markClosed()
            console.log("[Popup] Closed by user")
            setTimeout(() => {
                setIsVisible(false)
                setIsClosing(false)
            }, 300)
        }, [isClosing])

        useEffect(() => onEvent(CLOSE_EVENT, handleClose), [handleClose])

        useEffect(() => {
            const onShow = () => {
                if (!shouldShowPopup()) return
                setIsVisible(true)
                console.log(
                    "[Popup] Triggering waitlist popup (shared timer immediate)",
                )
            }
            return onEvent(SHOW_EVENT, onShow)
        }, [])

        useEffect(() => {
            if (!shouldShowPopup()) {
                console.log(
                    "[Popup] Waitlist popup skipped (cooldown active or already joined)",
                )
                return
            }

            const w = window as any
            const startedAt = Number(w[TIMER_AT_KEY] || 0)
            const alreadyStarted = Boolean(w[TIMER_KEY])
            if (alreadyStarted && startedAt > 0) {
                const elapsed = Date.now() - startedAt
                if (elapsed >= POPUP_DELAY_MS) {
                    emitShow()
                }
                return
            }

            w[TIMER_KEY] = true
            w[TIMER_AT_KEY] = Date.now()
            const timer = window.setTimeout(() => {
                if (shouldShowPopup()) {
                    console.log("[Popup] Triggering waitlist popup")
                    emitShow()
                }
            }, POPUP_DELAY_MS)

            return () => window.clearTimeout(timer)
        }, [])

        useEffect(() => {
            if (!isVisible) return
            const onEsc = (event: KeyboardEvent) => {
                if (event.key === "Escape") emitClose()
            }
            window.addEventListener("keydown", onEsc)
            return () => window.removeEventListener("keydown", onEsc)
        }, [isVisible])

        const isActive = isVisible || isClosing
        const animationName = useMemo(
            () => (isClosing ? "twnPopupOut" : "twnPopupIn"),
            [isClosing],
        )

        const isFramer = RenderTarget.current() === RenderTarget.canvas ||
            (typeof window !== "undefined" &&
                window.location.href.includes("framer.com"))

        if (isFramer) {
            return null
        }

        if (!domReady || !isActive) return null

        return createPortal(
            <>
                <style>
                    {`
                    @keyframes twnOverlayIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes twnOverlayOut { from { opacity: 1; } to { opacity: 0; } }
                    @keyframes twnPopupIn {
                        from { opacity: 0; transform: scale(0.97) translateY(10px); }
                        to { opacity: 1; transform: scale(1) translateY(0); }
                    }
                    @keyframes twnPopupOut {
                        from { opacity: 1; transform: scale(1) translateY(0); }
                        to { opacity: 0; transform: scale(0.97) translateY(10px); }
                    }
                `}
                </style>
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 99999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                        overflowY: "auto",
                        pointerEvents: "auto",
                    }}
                >
                    <div
                        onClick={() => emitClose()}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(0, 0, 0, 0.6)",
                            animation: `${isClosing ? "twnOverlayOut" : "twnOverlayIn"} 0.3s ease forwards`,
                        }}
                    />
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: "relative",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            maxWidth: "92vw",
                            maxHeight: "92vh",
                            backgroundColor: "transparent",
                            animation: `${animationName} 0.35s ease forwards`,
                        }}
                    >
                        <Component
                            {...props}
                            style={{
                                ...props.style,
                                position: "relative",
                                width: "fit-content",
                                height: "fit-content",
                                margin: "auto",
                                top: "auto",
                                bottom: "auto",
                                left: "auto",
                                right: "auto",
                                transform: "none",
                            }}
                        />
                    </div>
                </div>
            </>,
            document.body,
        )
    }
}

export function withClosePopup(Component: ComponentType): ComponentType {
    return function ClosePopup(props: any) {
        return (
            <Component
                {...props}
                onClick={(event: any) => {
                    event?.stopPropagation?.()
                    props.onClick?.(event)
                    emitClose()
                }}
                style={{
                    ...(props.style || {}),
                    cursor: "pointer",
                }}
            />
        )
    }
}

export function withPopupSubmitted(Component: ComponentType): ComponentType {
    return function PopupSubmitted(props: any) {
        return (
            <Component
                {...props}
                onClick={async (event: any) => {
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true

                    try {
                        const form = event?.currentTarget?.closest?.("form") || null
                        const ok = await postLead(
                            form,
                            props?.status === "partial_fill" ? "partial_fill" : undefined,
                        )
                        if (!ok) {
                            console.warn("[Popup] Lead capture failed; state not persisted")
                            return
                        }
                        props.onClick?.(event)
                        markSubmitted()
                        console.log("[Popup] Form submitted — state persisted")
                        emitClose()
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                }}
            />
        )
    }
}

export function withPopupFormSubmit(Component: ComponentType): ComponentType {
    return function PopupFormSubmit(props: any) {
        return (
            <Component
                {...props}
                onSubmit={async (event: any) => {
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true

                    try {
                        const form = event?.currentTarget?.tagName === "FORM"
                            ? event.currentTarget
                            : event?.currentTarget?.closest?.("form") || null
                        const ok = await postLead(
                            form,
                            props?.status === "partial_fill" ? "partial_fill" : undefined,
                        )
                        if (!ok) {
                            console.warn(
                                "[Popup] Lead capture failed; state not persisted",
                            )
                            return
                        }
                        props.onSubmit?.(event)
                        markSubmitted()
                        console.log("[Popup] Form submitted — state persisted")
                        emitClose()
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                }}
            />
        )
    }
}

// =====================================================
// LEAD TRACKING OVERRIDES (NTC Invite & Trip Page Leads)
// =====================================================

async function postLeadWithSource(
    form: HTMLFormElement | null,
    source: string,
    statusOverride?: string,
): Promise<boolean> {
    const root = form ?? document
    const email = normalizeEmail(
        findInputValue(root, [
            'input[type="email"]',
            'input[name="email"]',
            'input[name*="email" i]',
            'input[placeholder*="email" i]',
        ]),
    )
    // The live trip-page form labels email as optional. An omitted email is
    // therefore an explicit partial form submission, while other submitted
    // routes still require a valid email.
    const inferredPartialFill = !email && source === "trip_page_lead"
    const effectiveStatus = statusOverride ||
        (inferredPartialFill ? "partial_fill" : "submitted")
    const isPartialFill = effectiveStatus === "partial_fill"
    if ((!email && !isPartialFill) || (email && !isValidEmail(email))) {
        console.warn(`[LeadTracking:${source}] Invalid email; skipping`)
        return false
    }

    const name = findInputValue(root, [
        'input[name="name"]',
        'input[name*="name" i]',
        'input[placeholder*="name" i]',
    ])
    const phone = findInputValue(root, [
        'input[type="tel"]',
        'input[name="phone"]',
        'input[name*="phone" i]',
        'input[placeholder*="phone" i]',
    ])
    const country_code = findInputValue(root, [
        'select[name*="country" i]',
        'input[name="country_code"]',
        'input[name*="country" i]',
        'input[name*="dial" i]',
    ])
    const instagram_id = findInputValue(root, [
        'input[name="instagram"]',
        'input[name*="instagram" i]',
        'input[placeholder*="instagram" i]',
        'input[name="instagram_id"]',
        'input[name*="insta" i]',
        'input[placeholder*="insta" i]',
    ])
    const reason = findInputValue(root, [
        'textarea[name="reason"]',
        'textarea[name*="reason" i]',
        'textarea[placeholder*="reason" i]',
        'input[name="reason"]',
        'input[name*="reason" i]',
        'textarea[name*="why" i]',
        'textarea[placeholder*="why" i]',
        'input[placeholder*="why" i]',
    ])

    const params = new URLSearchParams(window.location.search)
    const projectRef = getProjectRefFromHost()
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/record-lead`
    const submission = getSubmissionId(source, form)

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                submission_id: submission.id,
                email,
                name: name || null,
                phone: phone || null,
                instagram_id: instagram_id || null,
                reason: reason || null,
                source,
                country_code: country_code || null,
                status: effectiveStatus,
                page_url: window.location.href,
                trip_id: params.get("tripId"),
                trip_slug: params.get("slug"),
                utm_source: params.get("utm_source"),
                utm_medium: params.get("utm_medium"),
                utm_campaign: params.get("utm_campaign"),
                utm_term: params.get("utm_term"),
                utm_content: params.get("utm_content"),
            }),
            keepalive: true,
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload?.ok !== true) {
            console.error(`[LeadTracking:${source}] Failed`, {
                status: response.status,
                payload,
            })
            if (response.status === 409 && payload?.code === "IDEMPOTENCY_CONFLICT") {
                clearSubmissionId(submission.key)
            }
            return false
        }

        console.log(`[LeadTracking:${source}] Captured`, {
            leadId: payload?.lead_id,
            sheetLogged: payload?.sheet_logged,
            sheetTab: payload?.sheet_tab,
        })
        clearSubmissionId(submission.key)
        return true
    } catch (error) {
        console.error(`[LeadTracking:${source}] Request failed`, error)
        return false
    }
}

function createLeadTrackingOverride(source: string, statusOverride?: string) {
    return function (Component: ComponentType): ComponentType {
        return function LeadTrackingCompatibilityAdapter(props: any) {
            return (
                <Component
                    {...props}
                    onClick={async (event: any) => {
                        event?.preventDefault?.()
                        event?.stopPropagation?.()
                        const w = window as any
                        if (w[SUBMIT_LOCK_KEY]) return
                        w[SUBMIT_LOCK_KEY] = true
                        const form = event?.currentTarget?.closest?.("form") || null
                        try {
                            const ok = await postLeadWithSource(form, source, statusOverride)
                            if (ok) props.onClick?.(event)
                        } finally {
                            window.setTimeout(() => {
                                w[SUBMIT_LOCK_KEY] = false
                            }, 700)
                        }
                    }}
                    onSubmit={undefined}
                />
            )
        }
    }
}

// Compatibility exports for existing Framer instances. All routes share the
// same submission-id, server-first lead capture implementation.
export function withCustomTripTracking(
    Component: ComponentType,
): ComponentType {
    return createLeadTrackingOverride("custom_trip_lead")(Component)
}

export function withWaitlistTracking(Component: ComponentType): ComponentType {
    return createLeadTrackingOverride("waitlist_popup")(Component)
}

export function withWaitlistAbandonTracking(
    Component: ComponentType,
): ComponentType {
    return createLeadTrackingOverride("waitlist_popup", "partial_fill")(
        Component,
    )
}

export function withLeadAbandonTrackingGeneric(
    Component: ComponentType,
): ComponentType {
    return createLeadTrackingOverride("generic_form", "partial_fill")(Component)
}

export function withLeadTracking(Component: ComponentType): ComponentType {
    return createLeadTrackingOverride("general_lead")(Component)
}

export function withFormTracking(Component: ComponentType): ComponentType {
    return createLeadTrackingOverride("general_lead", "partial_fill")(Component)
}

/**
 * withBookingInviteTracking — Apply to the NTC Invite form submit button.
 * Scrapes name, email, phone, Instagram ID, and reason from the form
 * and sends to record-lead with source = "booking_invite".
 */
export function withBookingInviteTracking(
    Component: ComponentType,
): ComponentType {
    return function BookingInviteTracking(props: any) {
        return (
            <Component
                {...props}
                onClick={async (event: any) => {
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true
                    const form = event?.currentTarget?.closest?.("form") || null
                    try {
                        const ok = await postLeadWithSource(
                            form,
                            "booking_invite",
                            props?.status === "partial_fill" ? "partial_fill" : undefined,
                        )
                        if (ok) props.onClick?.(event)
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                }}
                onSubmit={undefined}
            />
        )
    }
}

/**
 * withTripPageLeadTracking — Apply to trip page lead capture forms.
 * Scrapes name, email, phone, Instagram ID, and reason from the form
 * and sends to record-lead with source = "trip_page_lead".
 */
export function withTripPageLeadTracking(
    Component: ComponentType,
): ComponentType {
    return function TripPageLeadTracking(props: any) {
        return (
            <Component
                {...props}
                onClick={async (event: any) => {
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true
                    const form = event?.currentTarget?.closest?.("form") || null
                    try {
                        const ok = await postLeadWithSource(
                            form,
                            "trip_page_lead",
                            props?.status === "partial_fill" ? "partial_fill" : undefined,
                        )
                        if (ok) props.onClick?.(event)
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                }}
                onSubmit={undefined}
            />
        )
    }
}

/**
 * Apply to an explicit partial-fill event. The source is supplied by the
 * component as `leadSource`/`data-source`, and defaults to `general_lead`.
 * Missing email is accepted only on this path.
 */
export function withPartialFillTracking(
    Component: ComponentType,
): ComponentType {
    return function PartialFillTracking(props: any) {
        return (
            <Component
                {...props}
                onClick={async (event: any) => {
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true
                    const source = String(
                        props?.leadSource || props?.["data-source"] || "general_lead",
                    ).trim()
                    const form = event?.currentTarget?.closest?.("form") || null
                    try {
                        const ok = await postLeadWithSource(form, source, "partial_fill")
                        if (ok) props.onClick?.(event)
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                }}
                onSubmit={undefined}
            />
        )
    }
}
