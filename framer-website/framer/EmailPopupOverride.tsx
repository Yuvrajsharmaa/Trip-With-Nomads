import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RenderTarget } from "framer";
import type { ComponentType } from "react";

const POPUP_DELAY_MS = 15_000;
const DISMISS_COOLDOWN_HOURS = 24;
const STORAGE_KEY = "twn_waitlist_popup_v2";

const SHOW_EVENT = "twn:popup:show";
const CLOSE_EVENT = "twn:popup:close";

const TIMER_KEY = "__twn_popup_timer_started";
const TIMER_AT_KEY = "__twn_popup_timer_started_at";
const SUBMIT_LOCK_KEY = "__twn_popup_submit_lock";

const PROD_PROJECT_REF = "jxozzvwvprmnhvafmpsa";
const STAGING_PROJECT_REF = "ieuwiinbvbdvjrdqqzlb";

type PopupState = {
    submitted?: boolean;
    closedAt?: number;
};

function readPopupState(): PopupState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as PopupState) : {};
    } catch {
        return {};
    }
}

function writePopupState(data: PopupState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function shouldShowPopup(): boolean {
    const state = readPopupState();
    if (state.submitted) return false;
    if (!state.closedAt) return true;
    const cooldownMs = DISMISS_COOLDOWN_HOURS * 60 * 60 * 1000;
    return Date.now() - state.closedAt > cooldownMs;
}

function markClosed() {
    writePopupState({ closedAt: Date.now() });
}

function markSubmitted() {
    writePopupState({ submitted: true, closedAt: Date.now() });
}

function emitShow() {
    window.dispatchEvent(new CustomEvent(SHOW_EVENT));
}

function emitClose() {
    window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
}

function onEvent(name: string, callback: () => void) {
    window.addEventListener(name, callback);
    return () => window.removeEventListener(name, callback);
}

function normalizeEmail(value: string): string {
    return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function findInputValue(root: ParentNode | null, selectors: string[]): string {
    if (!root) return "";
    for (const selector of selectors) {
        const node = root.querySelector(selector) as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null;
        if (node && String(node.value || "").trim()) {
            return String(node.value || "").trim();
        }
    }
    return "";
}

function getProjectRefFromHost(): string {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host.includes(".framer.app") || host.includes("staging")) {
        return STAGING_PROJECT_REF;
    }
    return PROD_PROJECT_REF;
}

async function postLead(form: HTMLFormElement | null): Promise<boolean> {
    const root = form ?? document;
    const email = normalizeEmail(
        findInputValue(root, [
            'input[type="email"]',
            'input[name="email"]',
            'input[name*="email" i]',
            'input[placeholder*="email" i]',
        ])
    );
    if (!email || !isValidEmail(email)) {
        console.warn("[Popup] Submit blocked by validation; state not persisted");
        form?.reportValidity?.();
        return false;
    }

    const name = findInputValue(root, [
        'input[name="name"]',
        'input[name*="name" i]',
        'input[placeholder*="name" i]',
    ]);
    const phone = findInputValue(root, [
        'input[type="tel"]',
        'input[name="phone"]',
        'input[name*="phone" i]',
        'input[placeholder*="phone" i]',
    ]);

    const params = new URLSearchParams(window.location.search);
    const projectRef = getProjectRefFromHost();
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/record-lead`;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                name: name || null,
                phone: phone || null,
                source: "waitlist_popup",
                page_url: window.location.href,
                trip_id: params.get("tripId"),
                trip_slug: params.get("slug"),
                utm_source: params.get("utm_source"),
                utm_medium: params.get("utm_medium"),
                utm_campaign: params.get("utm_campaign"),
            }),
            keepalive: true,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true) {
            console.error("[Popup] Lead capture failed", {
                status: response.status,
                payload,
            });
            return false;
        }

        console.log("[Popup] Lead captured", {
            leadId: payload?.lead_id,
            sheetLogged: payload?.sheet_logged,
        });
        return true;
    } catch (error) {
        console.error("[Popup] Lead capture request failed", error);
        return false;
    }
}

export function withPopupOverlay(Component: ComponentType): ComponentType {
    return function PopupOverlay(props: any) {
        const [domReady, setDomReady] = useState(false);
        const [isVisible, setIsVisible] = useState(false);
        const [isClosing, setIsClosing] = useState(false);

        useEffect(() => setDomReady(true), []);

        const handleClose = useCallback(() => {
            if (isClosing) return;
            setIsClosing(true);
            markClosed();
            console.log("[Popup] Closed by user");
            setTimeout(() => {
                setIsVisible(false);
                setIsClosing(false);
            }, 300);
        }, [isClosing]);

        useEffect(() => onEvent(CLOSE_EVENT, handleClose), [handleClose]);

        useEffect(() => {
            const onShow = () => {
                if (!shouldShowPopup()) return;
                setIsVisible(true);
                console.log("[Popup] Triggering waitlist popup (shared timer immediate)");
            };
            return onEvent(SHOW_EVENT, onShow);
        }, []);

        useEffect(() => {
            if (!shouldShowPopup()) {
                console.log(
                    "[Popup] Waitlist popup skipped (cooldown active or already joined)"
                );
                return;
            }

            const w = window as any;
            const startedAt = Number(w[TIMER_AT_KEY] || 0);
            const alreadyStarted = Boolean(w[TIMER_KEY]);
            if (alreadyStarted && startedAt > 0) {
                const elapsed = Date.now() - startedAt;
                if (elapsed >= POPUP_DELAY_MS) {
                    emitShow();
                }
                return;
            }

            w[TIMER_KEY] = true;
            w[TIMER_AT_KEY] = Date.now();
            const timer = window.setTimeout(() => {
                if (shouldShowPopup()) {
                    console.log("[Popup] Triggering waitlist popup");
                    emitShow();
                }
            }, POPUP_DELAY_MS);

            return () => window.clearTimeout(timer);
        }, []);

        useEffect(() => {
            if (!isVisible) return;
            const onEsc = (event: KeyboardEvent) => {
                if (event.key === "Escape") emitClose();
            };
            window.addEventListener("keydown", onEsc);
            return () => window.removeEventListener("keydown", onEsc);
        }, [isVisible]);

        const isActive = isVisible || isClosing;
        const animationName = useMemo(
            () => (isClosing ? "twnPopupOut" : "twnPopupIn"),
            [isClosing]
        );

        const isFramer =
            RenderTarget.current() === RenderTarget.canvas ||
            (typeof window !== "undefined" && window.location.href.includes("framer.com"));

        if (isFramer) {
            return null;
        }

        if (!domReady || !isActive) return null;

        return createPortal(
            <>
                <style>{`
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
                `}</style>
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
                            width: "fit-content",
                            maxWidth: "92vw",
                            backgroundColor: "transparent",
                            animation: `${animationName} 0.35s ease forwards`,
                        }}
                    >
                        <Component {...props} />
                    </div>
                </div>
            </>,
            document.body
        );
    };
}

export function withClosePopup(Component: ComponentType): ComponentType {
    return function ClosePopup(props: any) {
        return (
            <Component
                {...props}
                onClick={(event: any) => {
                    event?.stopPropagation?.();
                    props.onClick?.(event);
                    emitClose();
                }}
                style={{
                    ...(props.style || {}),
                    cursor: "pointer",
                }}
            />
        );
    };
}

export function withPopupSubmitted(Component: ComponentType): ComponentType {
    return function PopupSubmitted(props: any) {
        return (
            <Component
                {...props}
                onClick={async (event: any) => {
                    const w = window as any;
                    if (w[SUBMIT_LOCK_KEY]) return;
                    w[SUBMIT_LOCK_KEY] = true;

                    try {
                        props.onClick?.(event);
                        const form = event?.currentTarget?.closest?.("form") || null;
                        const ok = await postLead(form);
                        if (!ok) {
                            console.warn("[Popup] Lead capture failed; state not persisted");
                            return;
                        }
                        markSubmitted();
                        console.log("[Popup] Form submitted — state persisted");
                        emitClose();
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false;
                        }, 700);
                    }
                }}
            />
        );
    };
}

export function withPopupFormSubmit(Component: ComponentType): ComponentType {
    return function PopupFormSubmit(props: any) {
        return (
            <Component
                {...props}
                onSubmit={async (event: any) => {
                    const w = window as any;
                    if (w[SUBMIT_LOCK_KEY]) return;
                    w[SUBMIT_LOCK_KEY] = true;

                    try {
                        props.onSubmit?.(event);
                        const form =
                            event?.currentTarget?.tagName === "FORM"
                                ? event.currentTarget
                                : event?.currentTarget?.closest?.("form") || null;
                        const ok = await postLead(form);
                        if (!ok) {
                            console.warn(
                                "[Popup] Lead capture failed; state not persisted"
                            );
                            return;
                        }
                        markSubmitted();
                        console.log("[Popup] Form submitted — state persisted");
                        emitClose();
                    } finally {
                        window.setTimeout(() => {
                            w[SUBMIT_LOCK_KEY] = false;
                        }, 700);
                    }
                }}
            />
        );
    };
}
