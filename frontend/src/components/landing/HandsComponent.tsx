import { useEffect, useState } from 'react'

interface HandsComponentProps {
    isMobile: boolean
    // Animation control props
    wiggleIntensity?: number  // 0-100, how much distortion
    wiggleSpeed?: number      // 0-100, how fast the animation
}

export default function HandsComponent({
    isMobile,
    wiggleIntensity = 25,    // Default intensity (more violent for hands)
    wiggleSpeed = 45         // Default speed (faster for hands)
}: HandsComponentProps) {
    const [scaleX, setScaleX] = useState(1)
    const [scaleY, setScaleY] = useState(1)

    useEffect(() => {
        let animationId: number

        const animate = () => {
            const time = Date.now() * 0.001 * (wiggleSpeed / 10)

            // More violent wiggle for hands - using different wave combinations
            const wiggleAmountX = (wiggleIntensity / 100) * 0.4 // Max 40% scale variation
            const wiggleAmountY = (wiggleIntensity / 100) * 0.4

            // Multiple sine waves for more chaotic movement
            const newScaleX = 1 +
                Math.sin(time * 4.2) * wiggleAmountX +
                Math.sin(time * 1.7) * (wiggleAmountX * 0.6) +
                Math.sin(time * 7.3) * (wiggleAmountX * 0.3)

            const newScaleY = 1 +
                Math.cos(time * 3.1) * wiggleAmountY +
                Math.cos(time * 5.8) * (wiggleAmountY * 0.7) +
                Math.cos(time * 2.4) * (wiggleAmountY * 0.4)

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
            src="/Hands.png"
            alt="Hands"
            className={`
                absolute z-10 transition-none
                ${isMobile
                    ? 'w-7/8 h-6/8 top-1/2 left-1/2'
                    : 'w-7/8 h-7/8 top-1/2 left-1/2'
                }
            `}
            style={{
                transform: `translate(-50%, -50%) scaleX(${scaleX}) scaleY(${scaleY})`,
                transformOrigin: 'center center'
            }}
        />
    )
}