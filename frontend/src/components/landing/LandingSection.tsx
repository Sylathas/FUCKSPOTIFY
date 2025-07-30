'use client'

import { useEffect, useState } from 'react'
import HandsComponent from './HandsComponent'
import ArrowsComponent from './ArrowsComponent'
import FuckTextComponent from './FuckTextComponent'

export default function LandingSection() {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener('resize', checkMobile)

        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Animation settings - adjust these to control the wiggle!
    const animationSettings = {
        arrows: {
            intensity: 30,
            speed: 50
        },
        hands: {
            intensity: 15,
            speed: 70
        },
        text: {
            intensity: 50,
            speed: 40
        }
    }

    return (
        <div className="relative w-full h-screen">
            {/* Individual components with wiggle animations */}
            <ArrowsComponent
                isMobile={isMobile}
                wiggleIntensity={animationSettings.arrows.intensity}
                wiggleSpeed={animationSettings.arrows.speed}
            />
            <HandsComponent
                isMobile={isMobile}
                wiggleIntensity={animationSettings.hands.intensity}
                wiggleSpeed={animationSettings.hands.speed}
            />
            <FuckTextComponent
                isMobile={isMobile}
                wiggleIntensity={animationSettings.text.intensity}
                wiggleSpeed={animationSettings.text.speed}
            />
        </div>
    )
}