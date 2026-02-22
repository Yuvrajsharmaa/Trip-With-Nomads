// EmailPopupOverride.tsx
// ─────────────────────────────────────────────────────────────
// Framer Code Overrides — Popup Visibility + Close Logic
//
// Your popup form & success state are designed in Framer.
// These overrides only control WHEN the popup appears and
// HOW the user can close it. No email/Supabase logic here.
//
// ─── SETUP IN FRAMER ─────────────────────────────────────────
//
// 1. Create this file in Assets → Code → New File
//    Name: EmailPopupOverride
//
// 2. Your popup component should be placed on the page at the
//    top level (not inside a scrollable section).
//
// 3. Apply these overrides:
//
//    ┌─────────────────────────────────────────────────────┐
//    │  ELEMENT                  │  OVERRIDE TO APPLY      │
//    ├─────────────────────────────────────────────────────┤
//    │  The popup component      │  withPopupOverlay       │
//    │  (the whole card/frame)   │                         │
//    ├─────────────────────────────────────────────────────┤
//    │  A close button (X icon)  │  withClosePopup         │
//    │  Add a small X element    │                         │
//    │  inside your popup design │                         │
//    ├─────────────────────────────────────────────────────┤
//    │  "Join waitlist" button   │  withPopupSubmitted     │
//    │  (the submit button)      │                         │
//    └─────────────────────────────────────────────────────┘
//
// 4. That's it! The popup will:
//    - Stay hidden for 15 seconds, then appear
//    - Close when user clicks X, clicks outside, or presses Escape
//    - Not show again for 1 day if closed
//    - Never show again if the user submitted the form
//
// ─────────────────────────────────────────────────────────────

import React from "react"
import { createPortal } from "react-dom"
import type { ComponentType } from "react"

const { useState, useEffect, useCallback } = React

// ─── CONFIGURATION (tweak as needed) ─────────────────────────
const POPUP_DELAY_MS = 15000       // Show popup after 15 seconds
const DISMISS_COOLDOWN_HOURS = 24  // If closed, show again after 24 hours
const STORAGE_KEY = "twn_popup"    // localStorage key

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────

function shouldShowPopup(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return true

        const data = JSON.parse(raw)

        // User submitted the form → never show again
        if (data.submitted) return false

        // User closed it → check cooldown
        if (data.closedAt) {
            const elapsed = Date.now() - data.closedAt
            const cooldownMs = DISMISS_COOLDOWN_HOURS * 60 * 60 * 1000
            return elapsed > cooldownMs
        }

        return true
    } catch {
        return true
    }
}

function markClosed() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ closedAt: Date.now() })
    )
}

function markSubmitted() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ submitted: true, at: Date.now() })
    )
}

// ─── SHARED STATE (communication between overrides) ──────────
// We use a simple window-level event bus so the close button
// override can tell the overlay override to hide.

function emitClose() {
    window.dispatchEvent(new CustomEvent("twn:popup:close"))
}

function onCloseEvent(callback: () => void) {
    window.addEventListener("twn:popup:close", callback)
    return () => window.removeEventListener("twn:popup:close", callback)
}

// ─── 1. withPopupOverlay ─────────────────────────────────────
// Apply this to your POPUP COMPONENT (the whole card/frame).
// The component is ALWAYS mounted (so Framer can pre-render it).
// We just toggle the overlay visibility after 15s.

export function withPopupOverlay(Component): ComponentType {
    return (props: any) => {
        const [isVisible, setIsVisible] = useState(false)
        const [isClosing, setIsClosing] = useState(false)
        const [domReady, setDomReady] = useState(false)

        useEffect(() => {
            setDomReady(true)
        }, [])

        // Timer to show popup after delay
        useEffect(() => {
            if (!shouldShowPopup()) {
                console.log("[Popup] Waitlist popup skipped (cooldown active or already joined)")
                return
            }

            const timer = setTimeout(() => {
                if (shouldShowPopup()) {
                    setIsVisible(true)
                    console.log("[Popup] Triggering waitlist popup")
                }
            }, POPUP_DELAY_MS)

            return () => clearTimeout(timer)
        }, [])

        // Listen for close events from withClosePopup
        const handleClose = useCallback(() => {
            if (isClosing) return
            setIsClosing(true)
            markClosed()
            setTimeout(() => {
                setIsVisible(false)
                setIsClosing(false)
            }, 350)
        }, [isClosing])

        useEffect(() => {
            return onCloseEvent(handleClose)
        }, [handleClose])

        // Close on Escape key
        useEffect(() => {
            if (!isVisible) return
            const onKey = (e: KeyboardEvent) => {
                if (e.key === "Escape") emitClose()
            }
            window.addEventListener("keydown", onKey)
            return () => window.removeEventListener("keydown", onKey)
        }, [isVisible])

        // Determine the current state
        const isActive = isVisible || isClosing

        // Optimization: Do NOT render the portal at all if the popup isn't active.
        // This prevents "invalid form control is not focusable" HTML errors 
        // caused by hidden required fields.
        if (!domReady || !isActive) return null

        return createPortal(
            <>
                <style>{`
                    @keyframes twnOverlayIn {
                        from { opacity: 0; }
                        to   { opacity: 1; }
                    }
                    @keyframes twnOverlayOut {
                        from { opacity: 1; }
                        to   { opacity: 0; }
                    }
                    @keyframes twnPopupIn {
                        from { opacity: 0; transform: scale(0.95) translateY(10px); }
                        to   { opacity: 1; transform: scale(1) translateY(0px); }
                    }
                    @keyframes twnPopupOut {
                        from { opacity: 1; transform: scale(1) translateY(0px); }
                        to   { opacity: 0; transform: scale(0.95) translateY(10px); }
                    }

                    /* Responsive Wrapper Logic */
                    .twn-popup-wrapper {
                        position: relative;
                        z-index: 2;
                        margin: auto; /* Vertically & Horizontally center safe */
                        display: flex;
                        flex-direction: column;
                        
                        /* Desktop: Fit content */
                        width: fit-content; 
                        max-width: 90vw;
                        
                        /* Animation */
                        will-change: transform, opacity;
                    }
                    @media (max-width: 800px) {
                        .twn-popup-wrapper {
                            /* Mobile: Force width constraint */
                            width: 90vw; 
                        }
                    }
                `}</style>

                {/* Main Container - Fixed, covers screen, SCROLLABLE */}
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 99999, // Always on top
                        visibility: isActive ? "visible" : "hidden",
                        display: "flex",
                        alignItems: "flex-start", // Allow scroll from top
                        justifyContent: "center", // Horizontal center
                        overflowY: "auto",        // Enable scroll
                        WebkitOverflowScrolling: "touch",
                        pointerEvents: isActive ? "auto" : "none",
                        padding: "20px 0", // Vertical breathing room
                    }}
                >
                    {/* Backdrop Layer - FIXED so it doesn't scroll away */}
                    <div
                        onClick={() => emitClose()}
                        style={{
                            position: "fixed", // Stays put
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(0, 0, 0, 0.6)",
                            animation: isActive
                                ? (isClosing ? "twnOverlayOut 0.3s ease forwards" : "twnOverlayIn 0.4s ease forwards")
                                : "none",
                        }}
                    />

                    {/* Popup Wrapper - Centers via margin: auto */}
                    <div
                        className="twn-popup-wrapper"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            animation: isActive
                                ? (isClosing ? "twnPopupOut 0.3s ease forwards" : "twnPopupIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards")
                                : "none",
                        }}
                    >
                        {/* The Framer Component */}
                        <Component
                            {...props}
                            style={{
                                ...(props.style || {}),
                                position: "relative",
                                width: "100%", // Fill the wrapper's width
                                height: "auto", // Allow height to grow (Fixes tiny box)
                            }}
                        />
                    </div>
                </div>
            </>,
            document.body
        )
    }
}

// ─── 2. withClosePopup ───────────────────────────────────────
// Apply this to a CLOSE BUTTON (X icon) inside your popup.
// Just add any element (text "✕", an icon, etc.) and apply this.
// On click, it closes the popup and sets the 24-hour cooldown.
//
// TIP: In Framer, you can add a simple Text element with "✕",
//      position it absolute top-right of your popup card,
//      then apply this override.

export function withClosePopup(Component): ComponentType {
    return (props: any) => {
        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    e?.stopPropagation?.()
                    emitClose()
                    console.log("[Popup] Closed by user")
                }}
                style={{
                    ...(props.style || {}),
                    cursor: "pointer",
                }}
            />
        )
    }
}

// ─── 3. withPopupSubmitted ───────────────────────────────────
// Apply this to your "Join waitlist" SUBMIT BUTTON.
// On click, it marks localStorage so the popup never shows again.
// Framer still handles the actual form submission & variant switch.
//
// NOTE: This does NOT interfere with Framer's form submission.
//       It just adds a localStorage flag alongside it.

export function withPopupSubmitted(Component): ComponentType {
    return (props: any) => {
        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    markSubmitted()
                    console.log("[Popup] Form submitted — won't show again")
                    // Let the original click handler (Framer form) continue
                    if (props.onClick) props.onClick(e)
                }}
            />
        )
    }
}
