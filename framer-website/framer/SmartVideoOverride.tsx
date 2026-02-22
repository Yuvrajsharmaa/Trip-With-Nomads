import type { ComponentType } from "react"
import React from "react"

const { useEffect, useRef } = React

// ─────────────────────────────────────────────────────────────
// Smart Video Override
// 1. Preloads video in background so it buffers ahead of time.
// 2. Plays ONLY when the video scrolls into the viewport.
// 3. Pauses when the user scrolls away (saves resources).
//
// USAGE: Apply "withSmartVideo" override to each Video component.
// ─────────────────────────────────────────────────────────────

export function withSmartVideo(Component): ComponentType {
    return (props: any) => {
        const containerRef = useRef<HTMLDivElement>(null)

        useEffect(() => {
            const container = containerRef.current
            if (!container) return

            // Guard: IntersectionObserver may not exist in all environments
            if (typeof IntersectionObserver === "undefined") return

            let observer: IntersectionObserver | null = null
            let video: HTMLVideoElement | null = null
            let hasPlayedOnce = false
            let disposed = false

            const trySetup = () => {
                if (disposed) return
                video = container.querySelector("video")
                if (!video) return

                // Force background buffering
                try { video.preload = "auto" } catch (_) { }

                // Create the observer
                observer = new IntersectionObserver(
                    (entries) => {
                        if (!video || disposed) return
                        for (let i = 0; i < entries.length; i++) {
                            if (entries[i].isIntersecting) {
                                video.play()
                                    .then(() => { hasPlayedOnce = true })
                                    .catch(() => { })
                            } else if (hasPlayedOnce) {
                                video.pause()
                            }
                        }
                    },
                    { threshold: 0.15, rootMargin: "200px 0px" }
                )

                // Observe — guard the call
                try {
                    observer.observe(video)
                } catch (err) {
                    console.warn("[SmartVideo] observer.observe failed:", err)
                    observer = null
                }
            }

            // Attempt setup immediately
            trySetup()

            // If the video wasn't in the DOM yet, poll for it
            let pollCount = 0
            let pollTimer: ReturnType<typeof setInterval> | null = null
            if (!video) {
                pollTimer = setInterval(() => {
                    pollCount++
                    trySetup()
                    if (video || pollCount > 25) {
                        if (pollTimer) clearInterval(pollTimer)
                    }
                }, 200)
            }

            return () => {
                disposed = true
                if (pollTimer) clearInterval(pollTimer)
                if (observer) {
                    try { observer.disconnect() } catch (_) { }
                }
            }
        }, [])

        // Pass ALL props straight through — no layout interference.
        // The wrapper div uses "display: contents" so it takes up
        // zero space in the layout. It exists only to give us a ref.
        return (
            <div ref={containerRef} style={{ display: "contents" }}>
                <Component {...props} />
            </div>
        )
    }
}
