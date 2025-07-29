import { useEffect, useState } from 'react'

interface FuckTextComponentProps {
    isMobile: boolean
    // Animation control props
    wiggleIntensity?: number  // 0-100, how much distortion
    wiggleSpeed?: number      // 0-100, how fast the animation
}

export default function FuckTextComponent({
    isMobile,
    wiggleIntensity = 20,    // Default intensity
    wiggleSpeed = 35         // Default speed
}: FuckTextComponentProps) {
    const [scaleX, setScaleX] = useState(1)
    const [scaleY, setScaleY] = useState(1)

    useEffect(() => {
        let animationId: number

        const animate = () => {
            const time = Date.now() * 0.001 * (wiggleSpeed / 10)

            // Text wiggle - different pattern from hands and arrows
            const wiggleAmountX = (wiggleIntensity / 100) * 0.25 // Max 25% scale variation
            const wiggleAmountY = (wiggleIntensity / 100) * 0.35 // Slightly more Y variation for text

            // Different frequencies to make it unique from other elements
            const newScaleX = 1 +
                Math.sin(time * 2.8) * wiggleAmountX +
                Math.sin(time * 6.1) * (wiggleAmountX * 0.4)

            const newScaleY = 1 +
                Math.cos(time * 4.7) * wiggleAmountY +
                Math.cos(time * 1.9) * (wiggleAmountY * 0.6)

            setScaleX(newScaleX)
            setScaleY(newScaleY)

            animationId = requestAnimationFrame(animate)
        }

        animate()

        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId)
            }
        }
    }, [wiggleIntensity, wiggleSpeed])

    return (
        <img
            src="/FuckText.png"
            alt="Fuck This Guy"
            className={`
                absolute z-10 transition-none
                ${isMobile
                    ? 'w-48 h-16 bottom-24 left-1/2'
                    : 'w-1/3 h-24 bottom-32 left-1/2'
                }
            `}
            style={{
                transform: `translate(-50%, 0) scaleX(${scaleX}) scaleY(${scaleY})`,
                transformOrigin: 'center center'
            }}
        />
    )
}