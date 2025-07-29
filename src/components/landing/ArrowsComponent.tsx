import { useEffect, useState } from 'react'

interface ArrowsComponentProps {
    isMobile: boolean
    // Animation control props
    wiggleIntensity?: number
    wiggleSpeed?: number
}

export default function ArrowsComponent({
    isMobile,
    wiggleIntensity = 15,
    wiggleSpeed = 30
}: ArrowsComponentProps) {
    const [scaleX, setScaleX] = useState(1)
    const [scaleY, setScaleY] = useState(1)

    useEffect(() => {
        let animationId: number

        const animate = () => {
            const time = Date.now() * 0.001 * (wiggleSpeed / 10) // Convert speed to time multiplier

            // Generate independent wiggle for X and Y using different sine wave frequencies
            const wiggleAmountX = (wiggleIntensity / 100) * 0.3 // Max 30% scale variation
            const wiggleAmountY = (wiggleIntensity / 100) * 0.3

            // Use different frequencies for X and Y to make them move independently
            const newScaleX = 1 + Math.sin(time * 3.7) * wiggleAmountX + Math.sin(time * 1.3) * (wiggleAmountX * 0.5)
            const newScaleY = 1 + Math.cos(time * 2.9) * wiggleAmountY + Math.cos(time * 4.1) * (wiggleAmountY * 0.5)

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
            src="/Arrows.png"
            alt="Arrows"
            className={`
                absolute z-10 transition-none
                ${isMobile
                    ? 'w-40 h-40 top-1/3 left-1/2'
                    : 'w-3/4 h-1/8 top-1/8 left-1/2'
                }
            `}
            style={{
                transform: `translate(-50%, -50%) scaleX(${scaleX}) scaleY(${scaleY})`,
                transformOrigin: 'center center'
            }}
        />
    )
}