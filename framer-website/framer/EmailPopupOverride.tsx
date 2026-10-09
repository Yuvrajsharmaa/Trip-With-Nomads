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
const MAX_LEAD_REQUEST_ATTEMPTS = 3
const IDEMPOTENT_RETRY_DELAY_MS = 300

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
    identitySuffix = "",
): { id: string; key: string } {
    const formIdentity = form?.id || form?.getAttribute("name") || "default"
    const normalizedSuffix = identitySuffix.trim().toLowerCase().replace(
        /[^a-z0-9_-]+/g,
        "-",
    )
    const suffix = normalizedSuffix ? `:${normalizedSuffix}` : ""
    const key =
        `__twn_lead_submission_v1:${source}:${window.location.pathname}:${formIdentity}${suffix}`
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
        const nodes = root.querySelectorAll(selector) as NodeListOf<
            HTMLInputElement | HTMLTextAreaElement
        >
        for (const node of nodes) {
            const value = String(node.value || "").trim()
            if (value) {
                return value
            }
        }
    }
    return ""
}

function resolveFormFromEvent(event: any): HTMLFormElement | null {
    const current = event?.currentTarget
    if (current instanceof HTMLFormElement) return current
    const target = event?.target instanceof Element ? event.target : null
    const fromTarget = target?.closest("form")
    if (fromTarget instanceof HTMLFormElement) return fromTarget
    const nestedForm = current?.querySelector?.("form")
    return nestedForm instanceof HTMLFormElement ? nestedForm : null
}

function replayFormSubmit(form: HTMLFormElement | null, event: any) {
    if (!form) return
    const target = event?.target instanceof Element ? event.target : null
    const submitter = target?.closest("button, input[type='submit']")
    const formSubmitter = submitter && form.contains(submitter)
        ? submitter as HTMLButtonElement | HTMLInputElement
        : undefined
    form.requestSubmit(formSubmitter)
}

function isFormSubmitClick(event: any, form: HTMLFormElement | null): boolean {
    if (!form) return false
    const target = event?.target instanceof Element ? event.target : null
    const control = target?.closest("button, input[type='submit'], input[type='image']")
    if (!control || !form.contains(control)) return false
    const type = String(control.getAttribute("type") || "submit").toLowerCase()
    return type === "submit" || type === "image"
}

type LeadActivityContext = {
    itineraryName?: string
    activityType?: string
    activityLabel?: string
    submissionIdentity?: string
    retainSubmissionId?: boolean
}

function firstNonEmptyText(...values: unknown[]): string {
    for (const value of values) {
        const text = String(value || "").trim()
        if (text) return text
    }
    return ""
}

function getItineraryName(props: any, target: any): string {
    const dataTarget = target?.closest?.(
        "[data-itinerary-name], [data-trip-name], [data-trip-title]",
    )
    const explicit = firstNonEmptyText(
        props?.itineraryName,
        props?.tripName,
        props?.["data-itinerary-name"],
        props?.["data-trip-name"],
        target?.getAttribute?.("data-itinerary-name"),
        target?.getAttribute?.("data-trip-name"),
        target?.getAttribute?.("data-trip-title"),
        dataTarget?.getAttribute?.("data-itinerary-name"),
        dataTarget?.getAttribute?.("data-trip-name"),
        dataTarget?.getAttribute?.("data-trip-title"),
    )
    if (explicit) return explicit

    const scope = target?.closest?.("article, section, main") || document
    const heading = scope.querySelector?.("h1, h2, h3")
    const headingText = String(heading?.textContent || "").trim()
    if (headingText && !/download itinerary|download|itinerary/i.test(headingText)) {
        return headingText
    }

    const title = String(document.title || "")
        .replace(/\s*[|–—-]\s*Trip With Nomads.*$/i, "")
        .trim()
    return title && !/download itinerary|download|itinerary/i.test(title) ? title : ""
}

function getProjectRefFromHost(): string {
    const host = String(window.location.hostname || "").toLowerCase()
    if (host.includes(".framer.app") || host.includes("staging")) {
        return STAGING_PROJECT_REF
    }
    return PROD_PROJECT_REF
}

async function fetchLeadWithRetry(
    endpoint: string,
    request: RequestInit,
): Promise<Response> {
    let lastNetworkError: unknown
    for (let attempt = 1; attempt <= MAX_LEAD_REQUEST_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(endpoint, request)
            if (
                attempt === MAX_LEAD_REQUEST_ATTEMPTS ||
                (response.status < 500 && response.status !== 429)
            ) return response
        } catch (error) {
            lastNetworkError = error
            if (attempt === MAX_LEAD_REQUEST_ATTEMPTS) throw error
        }

        // Reuse the same submission_id and payload: the server makes this
        // retry idempotent even if the first response was lost after commit.
        await new Promise((resolve) =>
            window.setTimeout(resolve, IDEMPOTENT_RETRY_DELAY_MS * attempt)
        )
    }

    if (lastNetworkError instanceof Error) throw lastNetworkError
    throw new Error("Lead request failed after retrying")
}

async function postLead(
    form: HTMLFormElement | null,
    statusOverride?: string,
): Promise<boolean> {
    if (!form) {
        console.warn("[Popup] Could not find the submitted form")
        return false
    }
    const root = form
    // Keep a completed form idempotent while Framer's success state is still
    // mounted. This closes the gap between the short network lock and a
    // second click after the first request has already committed.
    if (root.dataset.twnLeadCaptured === "true") return true
    const email = normalizeEmail(
        findInputValue(root, [
            'input[type="email"]',
            'input[name="email"]',
            'input[name*="email" i]',
            'input[placeholder*="email" i]',
        ]),
    )
    const isPartialFill = statusOverride === "partial_fill"
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
    const phoneOnlyWaitlistContact = !email && Boolean(phone)
    if (
        (!email && !isPartialFill && !phoneOnlyWaitlistContact) ||
        (email && !isValidEmail(email))
    ) {
        console.warn("[Popup] Submit blocked by validation; state not persisted")
        form?.reportValidity?.()
        return false
    }
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
    const companyName = findInputValue(root, [
        'input[name="company_name"]',
        'input[name*="company" i]',
        'input[placeholder*="company" i]',
    ])
    const customDestination = findInputValue(root, [
        'input[placeholder*="where would you like to go" i]',
        'textarea[placeholder*="where would you like to go" i]',
        'input[name*="destination" i]',
        'textarea[name*="destination" i]',
    ])
    const pathname = String(window.location.pathname || "").toLowerCase()
    const isCustomTripForm = Boolean(customDestination) ||
        Boolean(root.querySelector(
            'input[placeholder*="where would you like to go" i], textarea[placeholder*="where would you like to go" i]',
        ))
    const leadSource = isCustomTripForm
        ? "custom_trip_lead"
        : (companyName || pathname.includes("/corporate-trips")
            ? "corporate_enquiry"
            : "waitlist_popup")
    const capturedReason = reason ||
        (isCustomTripForm && customDestination
            ? `Custom trip enquiry: ${customDestination}`
            : "")

    const params = new URLSearchParams(window.location.search)
    const projectRef = getProjectRefFromHost()
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/record-lead`
    const submission = getSubmissionId(leadSource, form)

    try {
        const response = await fetchLeadWithRetry(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                submission_id: submission.id,
                email,
                name: name || null,
                phone: phone || null,
                country_code: country_code || null,
                instagram_id: instagram_id || null,
                reason: capturedReason || null,
                company_name: companyName || null,
                notes: companyName ? `Company: ${companyName}` : null,
                source: leadSource,
                status: statusOverride || "submitted",
                page_url: window.location.href,
                trip_id: params.get("tripId"),
                trip_slug: params.get("slug"),
                trip_name: isCustomTripForm ? customDestination || null : null,
                itinerary_name: isCustomTripForm ? customDestination || null : null,
                utm_source: params.get("utm_source"),
                utm_medium: params.get("utm_medium"),
                utm_campaign: params.get("utm_campaign"),
                utm_term: params.get("utm_term"),
                utm_content: params.get("utm_content"),
            }),
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
        if (!isPartialFill) root.dataset.twnLeadCaptured = "true"
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
                            animation: `${
                                isClosing ? "twnOverlayOut" : "twnOverlayIn"
                            } 0.3s ease forwards`,
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
                    const form = resolveFormFromEvent(event)
                    if (!isFormSubmitClick(event, form)) {
                        props.onClick?.(event)
                        return
                    }
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true

                    try {
                        const form = resolveFormFromEvent(event)
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
                        const form = resolveFormFromEvent(event)
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
    activity: LeadActivityContext = {},
): Promise<boolean> {
    if (!form) {
        console.warn(`[LeadTracking:${source}] Could not find the submitted form`)
        return false
    }
    const root = form
    if (root.dataset.twnLeadCaptured === "true") return true
    const email = normalizeEmail(
        findInputValue(root, [
            'input[type="email"]',
            'input[name="email"]',
            'input[name*="email" i]',
            'input[placeholder*="email" i]',
        ]),
    )
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
    // Completed itinerary requests can use a phone number as their contact;
    // partial requests on other trip forms remain explicitly marked.
    const inferredPartialFill = !email && source === "trip_page_lead"
    const effectiveStatus = statusOverride ||
        (inferredPartialFill ? "partial_fill" : "submitted")
    const isPartialFill = effectiveStatus === "partial_fill"
    const phoneOnlyContact = (source === "booking_invite" ||
        source === "general_lead") && !email && Boolean(phone)
    if (isPartialFill && !name && !email && !phone) {
        console.warn(`[LeadTracking:${source}] Partial submission has no contact details`)
        return false
    }
    if (
        (!email && !isPartialFill && source !== "trip_itinerary_download" &&
            !phoneOnlyContact) ||
        (email && !isValidEmail(email))
    ) {
        console.warn(`[LeadTracking:${source}] Invalid email; skipping`)
        return false
    }
    if (
        source === "trip_itinerary_download" && !email && !isPartialFill &&
        !phone
    ) {
        form.reportValidity?.()
        console.warn(`[LeadTracking:${source}] Phone is required when email is omitted`)
        return false
    }
    if (source === "booking_invite" && !isPartialFill && !phone) {
        form.reportValidity?.()
        console.warn(`[LeadTracking:${source}] Phone is required when email is omitted`)
        return false
    }
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
    if (source === "booking_invite" && !isPartialFill && !reason) {
        const reasonInput = root.querySelector(
            'textarea[name*="reason" i], input[name*="reason" i], textarea[name*="why" i], input[name*="why" i]',
        ) as HTMLInputElement | HTMLTextAreaElement | null
        reasonInput?.focus?.()
        form.reportValidity?.()
        console.warn(`[LeadTracking:${source}] A travel reason is required`)
        return false
    }
    const companyName = findInputValue(root, [
        'input[name="company_name"]',
        'input[name*="company" i]',
        'input[placeholder*="company" i]',
    ])

    const params = new URLSearchParams(window.location.search)
    const projectRef = getProjectRefFromHost()
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/record-lead`
    const submission = getSubmissionId(
        source,
        form,
        activity.submissionIdentity || "",
    )

    try {
        const response = await fetchLeadWithRetry(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                submission_id: submission.id,
                email,
                name: name || null,
                phone: phone || null,
                instagram_id: instagram_id || null,
                reason: reason || null,
                company_name: companyName || null,
                notes: companyName ? `Company: ${companyName}` : null,
                source,
                country_code: country_code || null,
                status: effectiveStatus,
                page_url: window.location.href,
                trip_id: params.get("tripId"),
                trip_slug: params.get("slug"),
                trip_name: activity.itineraryName || null,
                itinerary_name: activity.itineraryName || null,
                activity_type: activity.activityType || null,
                activity_label: activity.activityLabel || null,
                utm_source: params.get("utm_source"),
                utm_medium: params.get("utm_medium"),
                utm_campaign: params.get("utm_campaign"),
                utm_term: params.get("utm_term"),
                utm_content: params.get("utm_content"),
            }),
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
        if (effectiveStatus !== "partial_fill") {
            root.dataset.twnLeadCaptured = "true"
        }
        if (!activity.retainSubmissionId) clearSubmissionId(submission.key)
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
                    data-twn-lead-source={source}
                    onClick={async (event: any) => {
                        const form = resolveFormFromEvent(event)
                        if (!isFormSubmitClick(event, form)) {
                            props.onClick?.(event)
                            return
                        }
                        event?.preventDefault?.()
                        event?.stopPropagation?.()
                        const w = window as any
                        if (w[SUBMIT_LOCK_KEY]) return
                        w[SUBMIT_LOCK_KEY] = true
                        try {
                            if (!form?.checkValidity?.()) {
                                form?.reportValidity?.()
                                return
                            }
                            const ok = await postLeadWithSource(form, source, statusOverride)
                            if (ok) {
                                if (form) replayFormSubmit(form, event)
                                else props.onClick?.(event)
                            }
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
    return function CustomTripTracking(props: any) {
        return (
            <Component
                {...props}
                data-twn-lead-source="custom_trip_lead"
                onClick={async (event: any) => {
                    const form = resolveFormFromEvent(event)
                    if (!isFormSubmitClick(event, form)) {
                        props.onClick?.(event)
                        return
                    }
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true
                    try {
                        if (!form?.checkValidity?.()) {
                            form?.reportValidity?.()
                            return
                        }
                        const ok = await postLeadWithSource(
                            form,
                            "custom_trip_lead",
                        )
                        if (ok) {
                            if (form) replayFormSubmit(form, event)
                            else props.onClick?.(event)
                        }
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
        const capturePartialInvite = (event: any) => {
            const form = resolveFormFromEvent(event)
            if (!form) return

            window.setTimeout(() => {
                if (
                    !form.isConnected ||
                    form.contains(document.activeElement) ||
                    form.dataset.twnLeadCaptured === "true" ||
                    form.dataset.twnBookingInvitePartialCaptured === "true"
                ) return

                const hasContact = findInputValue(form, [
                    'input[type="email"]',
                    'input[type="tel"]',
                    'input[name*="name" i]',
                ])
                if (!hasContact) return

                form.dataset.twnBookingInvitePartialCaptured = "pending"
                const w = window as any
                if (w[SUBMIT_LOCK_KEY]) {
                    form.dataset.twnBookingInvitePartialCaptured = "false"
                    return
                }
                w[SUBMIT_LOCK_KEY] = true
                void (async () => {
                    try {
                        const ok = await postLeadWithSource(
                            form,
                            "booking_invite",
                            "partial_fill",
                        )
                        form.dataset.twnBookingInvitePartialCaptured = ok
                            ? "true"
                            : "false"
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                })()
            }, 500)
        }

        useEffect(() => {
            const submitHandler = (event: Event) => {
                const form = event.target instanceof HTMLFormElement
                    ? event.target
                    : null
                if (!form) return

                const sourceNode = form.closest("[data-twn-lead-source]") ||
                    form.querySelector("[data-twn-lead-source]")
                const source = String(
                    sourceNode?.getAttribute("data-twn-lead-source") || "",
                ).trim().toLowerCase()
                if (source !== "booking_invite") return

                const w = window as any
                if (w.__twn_replaying_booking_invite_submit) return
                event.preventDefault()
                event.stopImmediatePropagation()
                if (w[SUBMIT_LOCK_KEY]) return
                w[SUBMIT_LOCK_KEY] = true

                void (async () => {
                    try {
                        if (!form.checkValidity()) {
                            form.reportValidity()
                            return
                        }
                        const ok = await postLeadWithSource(
                            form,
                            "booking_invite",
                            props?.status === "partial_fill"
                                ? "partial_fill"
                                : undefined,
                        )
                        if (!ok) return

                        // Preserve Framer's native success state after the
                        // server has accepted the lead. The replay guard keeps
                        // this form submit from creating a second lead event.
                        w.__twn_replaying_booking_invite_submit = true
                        form.requestSubmit()
                        w.__twn_replaying_booking_invite_submit = false
                    } finally {
                        window.setTimeout(() => {
                            w.__twn_replaying_booking_invite_submit = false
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                })()
            }

            document.addEventListener("submit", submitHandler, true)
            return () => document.removeEventListener("submit", submitHandler, true)
        }, [])

        return (
            <Component
                {...props}
                data-twn-lead-source="booking_invite"
                onBlur={(event: any) => {
                    props.onBlur?.(event)
                    capturePartialInvite(event)
                }}
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
        const getExplicitFormSource = (form: HTMLFormElement | null): string => {
            const marked = form?.closest?.("[data-twn-lead-source]") ||
                form?.querySelector?.("[data-twn-lead-source]")
            return String(marked?.getAttribute?.("data-twn-lead-source") || "")
                .trim()
                .toLowerCase()
        }

        const isBookingInviteForm = (form: HTMLFormElement | null): boolean =>
            getExplicitFormSource(form) === "booking_invite"

        const isCustomTripForm = (form: HTMLFormElement | null): boolean =>
            getExplicitFormSource(form) === "custom_trip_lead"

        useEffect(() => {
            const isTripLeadForm = (form: HTMLFormElement | null): boolean => {
                const explicitSource = getExplicitFormSource(form)
                if (explicitSource) return explicitSource === "trip_page_lead"
                return Boolean(
                    form?.querySelector(
                        'input[placeholder*="What would you like us to call you?" i]',
                    ),
                )
            }

            const captureTripLead = (
                event: Event,
                form: HTMLFormElement,
                replay: () => void,
                source: "trip_page_lead" | "custom_trip_lead" = "trip_page_lead",
            ) => {
                const w = window as any
                if (w.__twn_replaying_trip_lead_submit) return
                event.preventDefault()
                event.stopImmediatePropagation()
                if (w[SUBMIT_LOCK_KEY]) return
                w[SUBMIT_LOCK_KEY] = true

                void (async () => {
                    try {
                        const ok = await postLeadWithSource(
                            form,
                            source,
                            undefined,
                        )
                        if (!ok) return

                        // Let Framer render its normal success state only after
                        // the server has accepted the lead. The replay guard
                        // prevents a second record-lead request.
                        w.__twn_replaying_trip_lead_submit = true
                        replay()
                        w.__twn_replaying_trip_lead_submit = false
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false
                        }, 700)
                    }
                })()
            }

            const submitHandler = (event: Event) => {
                const form = event.target instanceof HTMLFormElement ? event.target : null
                if (!form) return
                if (isBookingInviteForm(form)) return
                if (isCustomTripForm(form)) {
                    captureTripLead(
                        event,
                        form,
                        () => form.requestSubmit(),
                        "custom_trip_lead",
                    )
                } else if (isTripLeadForm(form)) {
                    captureTripLead(event, form, () => form.requestSubmit())
                }
            }

            const clickHandler = (event: Event) => {
                const target = event.target
                const element = target instanceof Element ? target : null
                const button = element?.closest("button") as HTMLButtonElement | null
                const form = button?.closest("form") as HTMLFormElement | null
                if (!button || !form) return
                if (isBookingInviteForm(form)) return
                if (!isFormSubmitClick(event, form)) return

                // Framer's reusable lead component can handle its submit
                // button through a component click path that bypasses the
                // browser submit event. Capture that path before Framer sees
                // it, then replay the click after the server acknowledgement.
                if (isCustomTripForm(form)) {
                    captureTripLead(
                        event,
                        form,
                        () => button.click(),
                        "custom_trip_lead",
                    )
                } else if (isTripLeadForm(form)) {
                    captureTripLead(event, form, () => button.click())
                }
            }

            document.addEventListener("submit", submitHandler, true)
            document.addEventListener("click", clickHandler, true)
            return () => {
                document.removeEventListener("submit", submitHandler, true)
                document.removeEventListener("click", clickHandler, true)
            }
        }, [])

        return (
            <Component
                {...props}
                data-twn-lead-source="trip_page_lead"
            />
        )
    }
}

/**
 * Capture a trip-page itinerary download before allowing the existing
 * download action to continue. The lead record is server-first and uses a
 * stable id per itinerary so repeated clicks do not create another event.
 */
export function withTripItineraryDownloadTracking(
    Component: ComponentType,
): ComponentType {
    return function TripItineraryDownloadTracking(props: any) {
        return (
            <Component
                {...props}
                onClick={async (event: any) => {
                    const form = resolveFormFromEvent(event)
                    if (!isFormSubmitClick(event, form)) {
                        props.onClick?.(event)
                        return
                    }
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    event?.persist?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true

                    const target = event?.currentTarget
                    if (form && !form.checkValidity()) {
                        form.reportValidity()
                        w[SUBMIT_LOCK_KEY] = false
                        return
                    }
                    const itineraryName = getItineraryName(props, target)
                    const params = new URLSearchParams(window.location.search)
                    const submissionIdentity = firstNonEmptyText(
                        props?.itinerarySlug,
                        props?.tripSlug,
                        props?.["data-itinerary-slug"],
                        params.get("tripId"),
                        params.get("slug"),
                        itineraryName,
                        "default",
                    ) + ":download"
                    const href = target?.href || props?.href || ""
                    const linkTarget = target?.target || props?.target || ""

                    try {
                        const ok = await postLeadWithSource(
                            form,
                            "trip_itinerary_download",
                            "submitted",
                            {
                                itineraryName,
                                activityType: "itinerary_download",
                                activityLabel: "Downloaded itinerary",
                                submissionIdentity,
                            },
                        )
                        if (!ok) return

                        if (form) form.dataset.twnItinerarySubmitted = "true"
                        if (href) {
                            if (linkTarget === "_blank") {
                                window.open(href, "_blank", "noopener,noreferrer")
                            } else {
                                window.location.assign(href)
                            }
                        } else if (form) {
                            replayFormSubmit(form, event)
                        } else if (typeof props.onClick === "function") {
                            props.onClick(event)
                        }
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
 * Track interaction with the itinerary form as a partial lead when the
 * visitor leaves before downloading. The submit button uses the download
 * adapter above, so both paths share one source and the same lock.
 */
export function withTripItineraryFormTracking(
    Component: ComponentType,
): ComponentType {
    return function TripItineraryFormTracking(props: any) {
        return (
            <Component
                {...props}
                data-twn-lead-source="trip_itinerary_download"
                onBlur={(event: any) => {
                    props.onBlur?.(event)
                    const form = resolveFormFromEvent(event)
                    const next = event?.relatedTarget
                    if (!form || (next instanceof Node && form.contains(next))) return

                    window.setTimeout(() => {
                        if (
                            !form.isConnected ||
                            form.contains(document.activeElement) ||
                            form.dataset.twnItinerarySubmitted === "true" ||
                            (form.dataset.twnItineraryPartialCaptured &&
                                form.dataset.twnItineraryPartialCaptured !== "false")
                        ) return
                        form.dataset.twnItineraryPartialCaptured = "pending"
                        const hasContact = findInputValue(form, [
                            'input[type="email"]',
                            'input[type="tel"]',
                            'input[name*="name" i]',
                        ])
                        if (!hasContact) {
                            form.dataset.twnItineraryPartialCaptured = "false"
                            return
                        }
                        const itineraryName = getItineraryName(props, form)
                        const params = new URLSearchParams(window.location.search)
                        const submissionIdentity = firstNonEmptyText(
                            props?.itinerarySlug,
                            props?.tripSlug,
                            props?.["data-itinerary-slug"],
                            params.get("tripId"),
                            params.get("slug"),
                            itineraryName,
                            "default",
                        ) + ":partial"
                        const submitPartial = async () => {
                            const w = window as any
                            if (w[SUBMIT_LOCK_KEY]) {
                                form.dataset.twnItineraryPartialCaptured = "false"
                                return
                            }
                            w[SUBMIT_LOCK_KEY] = true
                            try {
                                const ok = await postLeadWithSource(
                                    form,
                                    "trip_itinerary_download",
                                    "partial_fill",
                                    {
                                        itineraryName,
                                        activityType: "itinerary_download",
                                        activityLabel: "Started itinerary request",
                                        submissionIdentity,
                                    },
                                )
                                form.dataset.twnItineraryPartialCaptured = ok ? "true" : "false"
                            } finally {
                                window.setTimeout(() => {
                                    w[SUBMIT_LOCK_KEY] = false
                                }, 700)
                            }
                        }
                        void submitPartial()
                    }, 500)
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
                    const form = resolveFormFromEvent(event)
                    if (!isFormSubmitClick(event, form)) {
                        props.onClick?.(event)
                        return
                    }
                    event?.preventDefault?.()
                    event?.stopPropagation?.()
                    const w = window as any
                    if (w[SUBMIT_LOCK_KEY]) return
                    w[SUBMIT_LOCK_KEY] = true
                    const source = String(
                        props?.leadSource || props?.["data-source"] || "general_lead",
                    ).trim()
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
