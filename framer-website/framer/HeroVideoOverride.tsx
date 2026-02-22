import type { ComponentType } from "react"
import React from "react"

const { useEffect, useRef, useState } = React

// ─────────────────────────────────────────────────────────────
// Hero Video Override — Reliable Autoplay + Sound Toggle
//
// THE REALITY:
//   Browsers WILL NOT allow unmuted autoplay. No timer, no hack
//   can bypass this — it's a hard security policy in Chrome,
//   Safari, and Firefox. Even YouTube can't do it.
//
// THIS OVERRIDE:
//   1. Plays the video MUTED so autoplay works reliably.
//   2. Shows a small, elegant 🔊 button so users can tap
//      once to enable sound. One tap = sound on permanently.
//   3. Remembers the user's choice in localStorage — if they
//      turned sound on before, next visit it will unmute
//      on their first click/tap anywhere on the page.
//
// SETUP IN FRAMER:
//   1. Set the Hero Video to: Autoplay ON, Muted ON, Loop ON
//   2. Apply this override (withHeroVideo) to the video component.
// ─────────────────────────────────────────────────────────────

const SOUND_PREF_KEY = "twn_hero_sound"

export function withHeroVideo(Component): ComponentType {
    return (props: any) => {
        const containerRef = useRef<HTMLDivElement>(null)
        const [isMuted, setIsMuted] = useState(true)
        const videoRef = useRef<HTMLVideoElement | null>(null)

        useEffect(() => {
            const container = containerRef.current
            if (!container) return

            let cleanedUp = false

            const findAndSetup = () => {
                const video = container.querySelector("video")
                if (!video) return false
                videoRef.current = video

                // Ensure muted autoplay works
                video.muted = true
                video.autoplay = true
                video.playsInline = true
                video.preload = "auto"

                // Start playback (muted — guaranteed to work)
                video.play().catch(() => { })

                // If user previously enabled sound, unmute on first click
                if (localStorage.getItem(SOUND_PREF_KEY) === "on") {
                    const unmuteOnGesture = () => {
                        if (cleanedUp || !videoRef.current) return
                        videoRef.current.muted = false
                        videoRef.current.volume = 1.0
                        setIsMuted(false)
                        document.removeEventListener("click", unmuteOnGesture, true)
                        document.removeEventListener("touchstart", unmuteOnGesture, true)
                        document.removeEventListener("keydown", unmuteOnGesture, true)
                    }
                    // Only real user gestures — NOT scroll (scroll causes pause)
                    document.addEventListener("click", unmuteOnGesture, { once: true, capture: true })
                    document.addEventListener("touchstart", unmuteOnGesture, { once: true, capture: true })
                    document.addEventListener("keydown", unmuteOnGesture, { once: true, capture: true })
                }

                return true
            }

            // Try immediately, poll if Framer hasn't rendered yet
            if (!findAndSetup()) {
                let attempts = 0
                const timer = setInterval(() => {
                    attempts++
                    if (findAndSetup() || attempts > 30 || cleanedUp) {
                        clearInterval(timer)
                    }
                }, 200)
            }

            return () => { cleanedUp = true }
        }, [])

        const toggleSound = (e: React.MouseEvent) => {
            e.stopPropagation()
            const video = videoRef.current
            if (!video) return

            if (video.muted) {
                video.muted = false
                video.volume = 1.0
                setIsMuted(false)
                localStorage.setItem(SOUND_PREF_KEY, "on")
                // If the browser paused it, restart
                if (video.paused) video.play().catch(() => { })
            } else {
                video.muted = true
                setIsMuted(true)
                localStorage.removeItem(SOUND_PREF_KEY)
            }
        }

        return (
            <div ref={containerRef} style={{ display: "contents" }}>
                <Component {...props} />

                {/* Floating sound toggle button */}
                <div
                    onClick={toggleSound}
                    style={{
                        position: "absolute",
                        bottom: "20px",
                        right: "20px",
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        background: "rgba(0, 0, 0, 0.5)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        zIndex: 10,
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        transition: "transform 0.2s ease, background 0.2s ease",
                        color: "#fff",
                        fontSize: "20px",
                        userSelect: "none",
                    }}
                    onMouseEnter={(e) => {
                        ; (e.currentTarget as HTMLDivElement).style.transform = "scale(1.1)"
                            ; (e.currentTarget as HTMLDivElement).style.background = "rgba(0, 0, 0, 0.7)"
                    }}
                    onMouseLeave={(e) => {
                        ; (e.currentTarget as HTMLDivElement).style.transform = "scale(1)"
                            ; (e.currentTarget as HTMLDivElement).style.background = "rgba(0, 0, 0, 0.5)"
                    }}
                    title={isMuted ? "Turn sound on" : "Turn sound off"}
                >
                    {isMuted ? (
                        /* Muted icon (speaker with X) */
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                    ) : (
                        /* Unmuted icon (speaker with waves) */
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                    )}
                </div>
            </div>
        )
    }
}
