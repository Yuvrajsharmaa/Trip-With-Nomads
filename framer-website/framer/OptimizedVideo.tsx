import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * Optimized Video
 *
 * @framerIntrinsicWidth 400
 * @framerIntrinsicHeight 300
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function OptimizedVideo(props) {
    const {
        videoUrl = "https://jxozzvwvprmnhvafmpsa.supabase.co/storage/v1/object/public/videos/herovideo_compressed.mp4",
        posterImage = {
            src: "https://framerusercontent.com/images/qufwJUSHMyRTtZtmWorOq1kx9M.webp",
        },
        borderRadius = 0,
        objectFit = "cover",
        isHero = true,
        overlayColor = "#000000",
        overlayOpacity = 0.3,
        showMuteButton = true,
        style,
    } = props

    const videoRef = React.useRef(null)
    const [isMuted, setIsMuted] = React.useState(true)

    const toggleMute = React.useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted
            React.startTransition(() => {
                setIsMuted(videoRef.current.muted)
            })
        }
    }, [])

    const posterSrc =
        posterImage?.src ||
        "https://framerusercontent.com/images/qufwJUSHMyRTtZtmWorOq1kx9M.webp"

    return (
        <div
            style={{
                ...style,
                borderRadius,
                overflow: "hidden",
                display: "flex",
                width: "100%",
                height: "100%",
                backgroundColor: "#000",
                position: "relative",
            }}
        >
            {/* The preloaded poster image to guarantee LCP even on slow mobile connections */}
            {isHero && posterSrc && (
                <img
                    src={posterSrc}
                    alt="Video Poster"
                    //@ts-ignore
                    fetchpriority="high"
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: objectFit,
                        objectPosition: "center",
                        zIndex: 0,
                        pointerEvents: "none",
                    }}
                />
            )}

            <video
                ref={videoRef}
                src={videoUrl}
                poster={posterSrc}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                // CRITICAL FOR MOBILE LCP: Do not preload the huge video aggressively,
                // rely on the poster image first.
                preload="none"
                //@ts-ignore
                fetchpriority={isHero ? "low" : "auto"}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: objectFit,
                    display: "block",
                    pointerEvents: "none",
                    zIndex: 1,
                    position: "relative",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    backgroundColor: overlayColor,
                    opacity: overlayOpacity,
                    pointerEvents: "none",
                    zIndex: 2,
                }}
            />

            {showMuteButton && (
                <div
                    onClick={toggleMute}
                    style={{
                        position: "absolute",
                        bottom: 24,
                        right: 24,
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        backgroundColor: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
                        color: "#fff",
                        zIndex: 10,
                        transition: "background-color 0.2s ease",
                    }}
                    onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                        "rgba(0, 0, 0, 0.6)")
                    }
                    onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                        "rgba(0, 0, 0, 0.4)")
                    }
                >
                    {isMuted ? (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <line x1="23" y1="9" x2="17" y2="15"></line>
                            <line x1="17" y1="9" x2="23" y2="15"></line>
                        </svg>
                    ) : (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                        </svg>
                    )}
                </div>
            )}
        </div>
    )
}

addPropertyControls(OptimizedVideo, {
    videoUrl: {
        type: ControlType.String,
        title: "Video URL",
        defaultValue:
            "https://jxozzvwvprmnhvafmpsa.supabase.co/storage/v1/object/public/videos/herovideo_compressed.mp4",
    },
    posterImage: {
        type: ControlType.ResponsiveImage,
        title: "Poster Image",
    },
    isHero: {
        type: ControlType.Boolean,
        title: "Priority (LCP)",
        defaultValue: true,
        enabledTitle: "High",
        disabledTitle: "Standard",
    },
    showMuteButton: {
        type: ControlType.Boolean,
        title: "Mute Button",
        defaultValue: true,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    overlayColor: {
        type: ControlType.Color,
        title: "Overlay Color",
        defaultValue: "#000000",
    },
    overlayOpacity: {
        type: ControlType.Number,
        title: "Overlay Opacity",
        defaultValue: 0.3,
        min: 0,
        max: 1,
        step: 0.05,
    },
    objectFit: {
        type: ControlType.Enum,
        title: "Object Fit",
        options: ["cover", "contain", "fill"],
        defaultValue: "cover",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        defaultValue: 0,
    },
})
