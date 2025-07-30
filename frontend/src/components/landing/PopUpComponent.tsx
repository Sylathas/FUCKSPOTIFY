import { useState, useEffect, useCallback } from 'react'

interface PopUpProps {
    isMobile: boolean
    wiggleIntensity: number
    wiggleSpeed: number
}

interface PopUp {
    id: number
    x: number
    y: number
    text: string
    rotation: number
    iconOnLeft: boolean  // Fixed at creation time to prevent jittering
    style: {
        backgroundColor: string
        borderColor: string
        textColor: string
        fontFamily: string
        fontSize: string
        borderWidth: string
    }
    isVisible: boolean
    scaleX: number
    scaleY: number
}

export default function FakePopUpsComponent({
    isMobile,
    wiggleIntensity,
    wiggleSpeed
}: PopUpProps) {
    const [popUps, setPopUps] = useState<PopUp[]>([])
    const [nextId, setNextId] = useState(1)

    // Pop-up text variations
    const textVariations = [
        "FUCK SPOTIFY",
    ]

    // Gray backgrounds with saturated borders like the reference image
    const colorSchemes = [
        {
            backgroundColor: '#E0E0E0', // Light gray background
            borderColor: '#00ff00ff', // Bright green border
            textColor: '#000000',
            borderWidth: '3px'
        },
        {
            backgroundColor: '#D8D8D8', // Light gray background
            borderColor: '#ff00ffff', // Magenta border
            textColor: '#000000',
            borderWidth: '2px'
        },
        {
            backgroundColor: '#E8E8E8', // Light gray background
            borderColor: '#00bfffff', // Cyan border
            textColor: '#000000',
            borderWidth: '4px'
        },
        {
            backgroundColor: '#DDDDDD', // Light gray background
            borderColor: '#ffff00ff', // Yellow border
            textColor: '#000000',
            borderWidth: '3px'
        },
        {
            backgroundColor: '#E5E5E5', // Light gray background
            borderColor: '#ff5500ff', // Orange border
            textColor: '#000000',
            borderWidth: '2px'
        },
        {
            backgroundColor: '#DFDFDF', // Light gray background
            borderColor: '#0066ffff', // Blue border
            textColor: '#000000',
            borderWidth: '3px'
        },
        {
            backgroundColor: '#E2E2E2', // Light gray background
            borderColor: '#ff0055ff', // Hot Pink border
            textColor: '#000000',
            borderWidth: '2px'
        }
    ]

    // Font families for that authentic early 2000s look
    const fontFamilies = [
        'Impact, sans-serif',
        'Arial Black, sans-serif',
        'Verdana, sans-serif',
        'Tahoma, sans-serif',
        'Comic Sans MS, cursive',
        'Times New Roman, serif'
    ]

    // Generate random position that avoids edges
    const getRandomPosition = useCallback(() => {
        const margin = isMobile ? 30 : 60
        const maxX = window.innerWidth - (isMobile ? 250 : 350) - margin
        const maxY = window.innerHeight - (isMobile ? 120 : 180) - margin

        return {
            x: Math.random() * maxX + margin,
            y: Math.random() * maxY + margin
        }
    }, [isMobile])

    // Create a new pop-up
    const createPopUp = useCallback(() => {
        const position = getRandomPosition()
        const colorScheme = colorSchemes[Math.floor(Math.random() * colorSchemes.length)]
        const fontFamily = fontFamilies[Math.floor(Math.random() * fontFamilies.length)]
        const text = textVariations[Math.floor(Math.random() * textVariations.length)]

        // Random rotation between -30 and 30 degrees
        const rotation = (Math.random() - 0.5) * 60
        // Fixed icon position to prevent jittering
        const iconOnLeft = Math.random() > 0.5

        const newPopUp: PopUp = {
            id: nextId,
            x: position.x,
            y: position.y,
            text: text,
            rotation: rotation,
            iconOnLeft: iconOnLeft,
            style: {
                ...colorScheme,
                fontFamily: fontFamily,
                fontSize: isMobile ? '12px' : '16px',
            },
            isVisible: true,
            scaleX: 1,
            scaleY: 1
        }

        setPopUps(prev => [...prev, newPopUp])
        setNextId(prev => prev + 1)

        // Auto-remove after a few seconds
        const lifetime = 1000 + Math.random() * 3000
        setTimeout(() => {
            setPopUps(prev => prev.filter(popup => popup.id !== newPopUp.id))
        }, lifetime)
    }, [nextId, getRandomPosition, isMobile])

    // Size wiggle animation for pop-ups (like hands component)
    useEffect(() => {
        if (popUps.length === 0) return

        let animationId: number

        const animate = () => {
            const time = Date.now() * 0.001 * (wiggleSpeed / 10)

            // Wiggle amount based on intensity
            const wiggleAmountX = (wiggleIntensity / 100) * 0.3 // Max 30% scale variation
            const wiggleAmountY = (wiggleIntensity / 100) * 0.3

            setPopUps(prev => prev.map(popup => {
                // Different time offsets for each popup to make them feel independent
                const timeOffset = popup.id * 0.5

                // Multiple sine waves for chaotic movement
                const newScaleX = 1 +
                    Math.sin((time + timeOffset) * 4.2) * wiggleAmountX +
                    Math.sin((time + timeOffset) * 1.7) * (wiggleAmountX * 0.6) +
                    Math.sin((time + timeOffset) * 7.3) * (wiggleAmountX * 0.3)

                const newScaleY = 1 +
                    Math.cos((time + timeOffset) * 3.1) * wiggleAmountY +
                    Math.cos((time + timeOffset) * 5.8) * (wiggleAmountY * 0.7) +
                    Math.cos((time + timeOffset) * 2.4) * (wiggleAmountY * 0.4)

                return {
                    ...popup,
                    scaleX: newScaleX,
                    scaleY: newScaleY
                }
            }))

            animationId = requestAnimationFrame(animate)
        }

        animate()

        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId)
            }
        }
    }, [popUps.length, wiggleIntensity, wiggleSpeed])

    // Spawn pop-ups periodically
    useEffect(() => {
        const spawnInterval = setInterval(() => {
            // Limit concurrent pop-ups (fewer on mobile)
            const maxPopUps = isMobile ? 5 : 10
            if (popUps.length < maxPopUps) {
                createPopUp()
            }
        }, isMobile ? 1000 : 500) // Slower spawn rate on mobile

        return () => clearInterval(spawnInterval)
    }, [createPopUp, popUps.length, isMobile])

    return (
        <div className="absolute inset-0 z-10">
            {popUps.map(popup => {
                return (
                    <div
                        key={popup.id}
                        className="absolute pointer-events-auto cursor-pointer select-none"
                        style={{
                            left: popup.x,
                            top: popup.y,
                            transform: `rotate(${popup.rotation}deg) scaleX(${popup.scaleX}) scaleY(${popup.scaleY})`,
                            transformOrigin: 'center center',
                            zIndex: 5 + popup.id,
                            willChange: 'transform', // Optimize for animations
                        }}
                    >
                        {/* Pop-up container with EXTREMELY pixelated styling */}
                        <div
                            className="relative"
                            style={{
                                backgroundColor: popup.style.backgroundColor,
                                border: `${popup.style.borderWidth} solid ${popup.style.borderColor}`,
                                borderRadius: '1px', // Super sharp corners
                                // Extremely blocky, aliased shadows
                                boxShadow: `
                                    1px 1px 0px ${popup.style.borderColor},
                                    2px 2px 0px ${popup.style.borderColor},
                                    3px 3px 0px rgba(0,0,0,0.8),
                                    4px 4px 0px rgba(0,0,0,0.6)
                                `,
                                minWidth: isMobile ? '200px' : '300px',
                                padding: 0,
                                // EXTREME low-res effects
                                imageRendering: 'pixelated' as const,
                                // Simulate upscaled low-res with harsh contrast
                                filter: 'contrast(2.5) saturate(2) brightness(1.1)',
                                // Disable ALL smoothing
                                WebkitFontSmoothing: 'none' as const,
                                // Add pixelation by scaling down and up (simulated)
                                transform: `scale(1.02)`, // Slight scale to enhance pixelation artifacts
                                // Force hardware acceleration for crisp edges
                                backfaceVisibility: 'hidden' as const,
                                perspective: 1000
                            }}
                        >
                            {/* Top section with EXTREME pixelation */}
                            <div
                                className="flex items-center justify-center relative"
                                style={{
                                    backgroundColor: popup.style.backgroundColor,
                                    borderBottom: `1px solid ${popup.style.borderColor}`,
                                    borderRadius: '0px', // Absolutely no curves
                                    padding: isMobile ? '12px 16px' : '16px 20px',
                                    // Super harsh, blocky inset shadows
                                    boxShadow: `
                                        inset 1px 0px 0px rgba(255,255,255,0.9),
                                        inset 0px 1px 0px rgba(255,255,255,0.9),
                                        inset -1px 0px 0px rgba(0,0,0,0.7),
                                        inset 0px -1px 0px rgba(0,0,0,0.7)
                                    `,
                                    // Flat, harsh colors - no gradients
                                    background: popup.style.backgroundColor,
                                    // EXTREME low-res text rendering
                                    WebkitFontSmoothing: 'none' as const,
                                    // Harsh pixelation filter
                                    filter: 'contrast(2.2) saturate(1.8)',
                                    // Simulate CRT scan lines effect
                                    backgroundImage: `
                                        linear-gradient(transparent 50%, rgba(0,0,0,0.05) 50%),
                                        linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.02) 50%)
                                    `,
                                    backgroundSize: '2px 2px, 2px 2px'
                                }}
                            >
                                {/* Ultra-pixelated icon on left */}
                                {popup.iconOnLeft && (
                                    <img
                                        src="/fuckspotify.png"
                                        alt="Icon"
                                        className="mr-3"
                                        style={{
                                            width: isMobile ? '20px' : '24px',
                                            height: isMobile ? '20px' : '24px',
                                            // EXTREME pixelation
                                            imageRendering: 'pixelated' as const,
                                            // Simulate heavily upscaled low-res image
                                            filter: `
                                                contrast(3) 
                                                saturate(2.5) 
                                                brightness(1.2)
                                                blur(0.2px)
                                            `,
                                            // Add slight scaling to enhance chunky pixels
                                            transform: 'scale(1.05)',
                                            // Force crisp edges
                                            clipPath: 'inset(0)'
                                        }}
                                    />
                                )}

                                {/* EXTREMELY pixelated text */}
                                <div
                                    style={{
                                        fontSize: popup.style.fontSize,
                                        fontFamily: popup.style.fontFamily,
                                        fontWeight: 'bold',
                                        color: popup.style.textColor,
                                        transform: "scaleX(1.3)",
                                        letterSpacing: '2px',
                                        // NUCLEAR font smoothing removal
                                        WebkitFontSmoothing: 'none' as const,
                                        // Multiple harsh shadows for chunky text effect
                                        textShadow: `
                                            1px 0px 0px rgba(0,0,0,1),
                                            0px 1px 0px rgba(0,0,0,1),
                                            1px 1px 0px rgba(0,0,0,1),
                                            2px 2px 0px rgba(0,0,0,0.5)
                                        `,
                                        // Extreme contrast and saturation
                                        filter: 'contrast(3) saturate(2) brightness(1.1)',
                                        // Force pixelated rendering
                                        textRendering: 'optimizeSpeed' as const,
                                        // Add slight blur to simulate upscaled pixels
                                        backdropFilter: 'contrast(2)',
                                        // Make text appear chunky
                                        fontVariantNumeric: 'normal'
                                    }}
                                >
                                    {popup.text}
                                </div>

                                {/* Ultra-pixelated icon on right */}
                                {!popup.iconOnLeft && (
                                    <img
                                        src="/fuckspotify.png"
                                        alt="Icon"
                                        className="ml-3"
                                        style={{
                                            width: isMobile ? '20px' : '24px',
                                            height: isMobile ? '20px' : '24px',
                                            // EXTREME pixelation
                                            imageRendering: 'pixelated' as const,
                                            // Simulate heavily upscaled low-res image
                                            filter: `
                                                contrast(3) 
                                                saturate(2.5) 
                                                brightness(1.2)
                                                blur(0.2px)
                                            `,
                                            // Add slight scaling to enhance chunky pixels
                                            transform: 'scale(1.05)',
                                            // Force crisp edges
                                            clipPath: 'inset(0)'
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}

            <style jsx>{`
                @keyframes popUpAppear {
                    0% {
                        opacity: 0;
                        transform: scale(0.8) translateY(-20px);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
            `}</style>
        </div>
    )
}