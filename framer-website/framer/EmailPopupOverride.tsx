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
const LEAD_ABANDON_DEBOUNCE_MS = 2000;
const LEAD_ABANDON_PREFIX = "twn_lead_abandon_v1";
const LEAD_SUBMITTED_PREFIX = "twn_lead_submitted_v1";
const LEAD_ID_PREFIX = "twn_lead_id_v1";
const LEAD_IN_FLIGHT_KEY = "__twn_lead_in_flight_v1";
const LEAD_IN_FLIGHT_TTL_MS = 10_000;

const CURRENT_RUNTIME =
  (typeof window !== "undefined"
    ? (window as any).__TWN_RUNTIME_CONFIG__
    : null) || {
    gatewayUrl: (typeof window !== "undefined" &&
        (window.location.hostname.includes("framer.app") ||
          window.location.hostname.includes("framer.website")))
      ? "https://twn-checkout-gateway-staging.tripwithnomads-crm.workers.dev"
      : "https://twn-checkout-gateway.tripwithnomads-crm.workers.dev",
  };

/**
 * useHydrated: A helper hook to prevent React hydration mismatches (#418).
 * Ensures that components render the same content on server and first client pass.
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/**
 * fetchGateway: Secure proxy wrapper for API calls.
 * Mandates the use of the Cloudflare gateway to avoid direct Supabase exposure.
 */
function fetchGateway(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const gatewayBase = String(CURRENT_RUNTIME.gatewayUrl || "").trim().replace(
    /\/+$/,
    "",
  );
  const gatewayPath = path.replace(/^\/+/, "");
  const url = `${gatewayBase}/${gatewayPath}`;

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

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

function getLeadIdentity(source: string, email: string): string {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  return `${source}|${email}|${params.get("slug") || ""}|${
    typeof window !== "undefined" ? window.location.pathname : ""
  }`;
}

function getLeadSubmittedKey(source: string, email: string): string {
  return `${LEAD_SUBMITTED_PREFIX}:${getLeadIdentity(source, email)}`;
}

function getLeadAbandonedKey(source: string, email: string): string {
  return `${LEAD_ABANDON_PREFIX}:${getLeadIdentity(source, email)}`;
}

function markLeadTrackingState(source: string, email: string, status: string) {
  const submittedKey = getLeadSubmittedKey(source, email);
  const abandonedKey = getLeadAbandonedKey(source, email);
  if (status === "submitted") {
    sessionStorage.setItem(submittedKey, "1");
    sessionStorage.setItem(abandonedKey, "1");
    return;
  }
  if (status === "partial_fill") {
    sessionStorage.setItem(abandonedKey, "1");
  }
}

function wasLeadAlreadyTracked(
  source: string,
  email: string,
  status: string,
): boolean {
  const submittedKey = getLeadSubmittedKey(source, email);
  const abandonedKey = getLeadAbandonedKey(source, email);
  if (status === "submitted") {
    return sessionStorage.getItem(submittedKey) === "1";
  }
  return (
    sessionStorage.getItem(submittedKey) === "1" ||
    sessionStorage.getItem(abandonedKey) === "1"
  );
}

function getLeadStatusIdentity(
  source: string,
  email: string,
  status: string,
): string {
  return `${getLeadIdentity(source, email)}|${status}`;
}

function getLeadIdKey(source: string, email: string, status: string): string {
  return `${LEAD_ID_PREFIX}:${getLeadStatusIdentity(source, email, status)}`;
}

function getOrCreateLeadId(
  source: string,
  email: string,
  status: string,
): string {
  const key = getLeadIdKey(source, email, status);
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionStorage.setItem(key, generated);
  return generated;
}

function getLeadInFlightMap(): Record<string, number> {
  const w = window as any;
  if (!w[LEAD_IN_FLIGHT_KEY]) w[LEAD_IN_FLIGHT_KEY] = {};
  return w[LEAD_IN_FLIGHT_KEY] as Record<string, number>;
}

function postLead(
  form: HTMLFormElement | null,
  statusOverride?: string,
): Promise<boolean> {
  const root = form ?? document;
  const email = normalizeEmail(
    findInputValue(root, [
      'input[type="email"]',
      'input[name="email"]',
      'input[name*="email" i]',
      'input[placeholder*="email" i]',
    ]),
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

  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const statusValue = statusOverride || "submitted";

  return fetchGateway("record-lead", {
    method: "POST",
    body: JSON.stringify({
      email,
      name: name || null,
      phone: phone || null,
      source: "waitlist_popup",
      status: statusValue,
      page_url: typeof window !== "undefined" ? window.location.href : null,
      trip_id: params.get("tripId"),
      trip_slug: params.get("slug"),
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    }),
    keepalive: true,
  })
    .then((response) =>
      response.json().catch(() => ({})).then((payload) => ({
        response,
        payload,
      }))
    )
    .then(({ response, payload }) => {
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
    })
    .catch((error) => {
      console.error("[Popup] Lead capture request failed", error);
      return false;
    });
}

export function withPopupOverlay(Component: ComponentType): ComponentType {
  return function PopupOverlay(props: any) {
    const isHydrated = useHydrated();
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
      if (!isHydrated) return;
    }, [isHydrated]);

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
        console.log(
          "[Popup] Triggering waitlist popup (shared timer immediate)",
        );
      };
      return onEvent(SHOW_EVENT, onShow);
    }, []);

    useEffect(() => {
      if (!shouldShowPopup()) {
        console.log(
          "[Popup] Waitlist popup skipped (cooldown active or already joined)",
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
      [isClosing],
    );

    const isFramer = RenderTarget.current() === RenderTarget.canvas ||
      (typeof window !== "undefined" &&
        window.location.href.includes("framer.com"));

    if (isFramer) {
      return null;
    }

    if (!isHydrated || !isActive) return null;

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
        onClick={(event: any) => {
          const w = window as any;
          if (w[SUBMIT_LOCK_KEY]) return;
          w[SUBMIT_LOCK_KEY] = true;

          props.onClick?.(event);
          const form = event?.currentTarget?.closest?.("form") || null;
          postLead(form)
            .then((ok) => {
              if (!ok) {
                console.warn(
                  "[Popup] Lead capture failed; state not persisted",
                );
                return;
              }
              markSubmitted();
              console.log("[Popup] Form submitted — state persisted");
              emitClose();
            })
            .finally(() => {
              window.setTimeout(() => {
                w[SUBMIT_LOCK_KEY] = false;
              }, 700);
            });
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
        onSubmit={(event: any) => {
          const w = window as any;
          if (w[SUBMIT_LOCK_KEY]) return;
          w[SUBMIT_LOCK_KEY] = true;

          props.onSubmit?.(event);
          const form = event?.currentTarget?.tagName === "FORM"
            ? event.currentTarget
            : event?.currentTarget?.closest?.("form") || null;
          postLead(form)
            .then((ok) => {
              if (!ok) {
                console.warn(
                  "[Popup] Lead capture failed; state not persisted",
                );
                return;
              }
              markSubmitted();
              console.log("[Popup] Form submitted — state persisted");
              emitClose();
            })
            .finally(() => {
              window.setTimeout(() => {
                w[SUBMIT_LOCK_KEY] = false;
              }, 700);
            });
        }}
      />
    );
  };
}

// =====================================================
// LEAD TRACKING OVERRIDES (NTC Invite & Trip Page Leads)
// =====================================================

function postLeadWithSource(
  form: HTMLFormElement | null,
  source: string,
  statusOverride?: string,
): Promise<boolean> {
  const root = form ?? document;
  const email = normalizeEmail(
    findInputValue(root, [
      'input[type="email"]',
      'input[name="email"]',
      'input[name*="email" i]',
      'input[placeholder*="email" i]',
    ]),
  );
  if (!email || !isValidEmail(email)) {
    console.warn(`[LeadTracking:${source}] Invalid email; skipping`);
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
  const instagram_id = findInputValue(root, [
    'input[name="instagram"]',
    'input[name*="instagram" i]',
    'input[placeholder*="instagram" i]',
    'input[name="instagram_id"]',
    'input[name*="insta" i]',
    'input[placeholder*="insta" i]',
  ]);
  const reason = findInputValue(root, [
    'textarea[name="reason"]',
    'textarea[name*="reason" i]',
    'textarea[placeholder*="reason" i]',
    'input[name="reason"]',
    'input[name*="reason" i]',
    'textarea[name*="why" i]',
    'textarea[placeholder*="why" i]',
    'input[placeholder*="why" i]',
  ]);

  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const statusValue = statusOverride || "submitted";
  const leadStatusIdentity = getLeadStatusIdentity(source, email, statusValue);

  if (wasLeadAlreadyTracked(source, email, statusValue)) {
    return true;
  }

  const leadInFlightMap = getLeadInFlightMap();
  const inFlightAt = Number(leadInFlightMap[leadStatusIdentity] || 0);
  if (inFlightAt > 0 && Date.now() - inFlightAt < LEAD_IN_FLIGHT_TTL_MS) {
    return true;
  }
  leadInFlightMap[leadStatusIdentity] = Date.now();

  return fetchGateway("record-lead", {
    method: "POST",
    body: JSON.stringify({
      lead_id: getOrCreateLeadId(source, email, statusValue),
      email,
      name: name || null,
      phone: phone || null,
      instagram_id: instagram_id || null,
      reason: reason || null,
      source,
      status: statusValue,
      page_url: typeof window !== "undefined" ? window.location.href : null,
      trip_id: params.get("tripId"),
      trip_slug: params.get("slug"),
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    }),
    keepalive: true,
  })
    .then((response) =>
      response.json().catch(() => ({})).then((payload) => ({
        response,
        payload,
      }))
    )
    .then(({ response, payload }) => {
      if (!response.ok || payload?.ok !== true) {
        console.error(`[LeadTracking:${source}] Failed`, {
          status: response.status,
          payload,
        });
        return false;
      }

      console.log(`[LeadTracking:${source}] Captured`, {
        leadId: payload?.lead_id,
        sheetLogged: payload?.sheet_logged,
        sheetTab: payload?.sheet_tab,
      });
      markLeadTrackingState(source, email, statusValue);
      return true;
    })
    .catch((error) => {
      console.error(`[LeadTracking:${source}] Request failed`, error);
      return false;
    })
    .finally(() => {
      delete leadInFlightMap[leadStatusIdentity];
    });
}

function resolveFormFromEvent(event: any): HTMLFormElement | null {
  const current = event?.currentTarget as any;
  if (current?.tagName === "FORM") return current as HTMLFormElement;
  if (current && typeof current.closest === "function") {
    const form = current.closest("form");
    if (form) return form as HTMLFormElement;
  }

  const target = event?.target as any;
  if (target?.form) return target.form as HTMLFormElement;
  if (target && typeof target.closest === "function") {
    const form = target.closest("form");
    if (form) return form as HTMLFormElement;
  }

  return null;
}

function postPartialLeadIfNeeded(
  form: HTMLFormElement | null,
  source: string,
): Promise<boolean> {
  const root = form ?? document;
  const email = normalizeEmail(
    findInputValue(root, [
      'input[type="email"]',
      'input[name="email"]',
      'input[name*="email" i]',
      'input[placeholder*="email" i]',
    ]),
  );
  if (!email || !isValidEmail(email)) return false;
  if (wasLeadAlreadyTracked(source, email, "partial_fill")) return false;
  return postLeadWithSource(form, source, "partial_fill");
}

function withLeadAbandonTracking(source: string) {
  return function (Component: ComponentType): ComponentType {
    return function LeadAbandonTracking(props: any) {
      const formRef = React.useRef<HTMLFormElement | null>(null);
      const timeoutRef = React.useRef<number | null>(null);

      const clearTimer = () => {
        if (timeoutRef.current != null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };

      const schedulePartial = (form: HTMLFormElement | null) => {
        if (form) formRef.current = form;
        clearTimer();
        timeoutRef.current = window.setTimeout(() => {
          void postPartialLeadIfNeeded(formRef.current, source);
        }, LEAD_ABANDON_DEBOUNCE_MS);
      };

      const flushPartial = () => {
        clearTimer();
        void postPartialLeadIfNeeded(formRef.current, source);
      };

      React.useEffect(() => {
        const onPageHide = () => flushPartial();
        const onVisibility = () => {
          if (document.visibilityState === "hidden") flushPartial();
        };

        window.addEventListener("pagehide", onPageHide);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
          window.removeEventListener("pagehide", onPageHide);
          document.removeEventListener("visibilitychange", onVisibility);
          clearTimer();
        };
      }, []);

      return (
        <Component
          {...props}
          onInput={(event: any) => {
            props.onInput?.(event);
            schedulePartial(resolveFormFromEvent(event));
          }}
          onChange={(event: any) => {
            props.onChange?.(event);
            schedulePartial(resolveFormFromEvent(event));
          }}
          onBlur={(event: any) => {
            props.onBlur?.(event);
            schedulePartial(resolveFormFromEvent(event));
          }}
          onSubmit={(event: any) => {
            props.onSubmit?.(event);
            const form = resolveFormFromEvent(event);
            if (form) formRef.current = form;
            clearTimer();
          }}
        />
      );
    };
  };
}

function withSubmitLeadTracking(source: string) {
  return function (Component: ComponentType): ComponentType {
    return function SubmitLeadTracking(props: any) {
      const submitLockRef = React.useRef(false);
      const formRef = React.useRef<HTMLFormElement | null>(null);
      const timeoutRef = React.useRef<number | null>(null);

      const clearTimer = () => {
        if (timeoutRef.current != null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };

      const schedulePartial = (form: HTMLFormElement | null) => {
        if (form) formRef.current = form;
        clearTimer();
        timeoutRef.current = window.setTimeout(() => {
          void postPartialLeadIfNeeded(formRef.current, source);
        }, LEAD_ABANDON_DEBOUNCE_MS);
      };

      const flushPartial = () => {
        clearTimer();
        void postPartialLeadIfNeeded(formRef.current, source);
      };

      const submitFromEvent = (event: any) => {
        if (submitLockRef.current) return;
        submitLockRef.current = true;
        const form = resolveFormFromEvent(event);
        if (form) formRef.current = form;
        postLeadWithSource(form, source, "submitted").finally(() => {
          window.setTimeout(() => {
            submitLockRef.current = false;
          }, 900);
        });
      };

      React.useEffect(() => {
        const onPageHide = () => flushPartial();
        const onVisibility = () => {
          if (document.visibilityState === "hidden") flushPartial();
        };

        window.addEventListener("pagehide", onPageHide);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
          window.removeEventListener("pagehide", onPageHide);
          document.removeEventListener("visibilitychange", onVisibility);
          clearTimer();
        };
      }, []);

      return (
        <Component
          {...props}
          onInput={(event: any) => {
            props.onInput?.(event);
            schedulePartial(resolveFormFromEvent(event));
          }}
          onChange={(event: any) => {
            props.onChange?.(event);
            schedulePartial(resolveFormFromEvent(event));
          }}
          onBlur={(event: any) => {
            props.onBlur?.(event);
            schedulePartial(resolveFormFromEvent(event));
          }}
          onClick={(event: any) => {
            props.onClick?.(event);
            submitFromEvent(event);
          }}
          onSubmit={(event: any) => {
            props.onSubmit?.(event);
            submitFromEvent(event);
          }}
        />
      );
    };
  };
}

/**
 * withBookingInviteTracking — Apply to the NTC Invite form submit button.
 */
export function withBookingInviteTracking(
  Component: ComponentType,
): ComponentType {
  return withSubmitLeadTracking("booking_invite")(Component);
}

/**
 * withTripPageLeadTracking — Apply to trip page lead capture forms.
 */
export function withTripPageLeadTracking(
  Component: ComponentType,
): ComponentType {
  return withSubmitLeadTracking("trip_page_lead")(Component);
}

/**
 * withWaitlistTracking — Apply to the waitlist form submit button.
 */
export function withWaitlistTracking(Component: ComponentType): ComponentType {
  return withSubmitLeadTracking("waitlist")(Component);
}

/**
 * withWaitlistAbandonTracking — Apply to the waitlist form (Frame) to track partial fills.
 */
export function withWaitlistAbandonTracking(
  Component: ComponentType,
): ComponentType {
  return withLeadAbandonTracking("waitlist")(Component);
}

/**
 * withLeadAbandonTracking — Generic abandon tracker for any lead form.
 */
export function withLeadAbandonTrackingGeneric(
  Component: ComponentType,
): ComponentType {
  return withLeadAbandonTracking("generic_form")(Component);
}

export function withLeadTracking(Component: ComponentType): ComponentType {
  return withSubmitLeadTracking("general_lead")(Component);
}

export function withFormTracking(Component: ComponentType): ComponentType {
  return withLeadAbandonTracking("general_lead")(Component);
}
