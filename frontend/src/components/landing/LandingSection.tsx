'use client'

import { useEffect, useState } from 'react'
import HandsComponent from './HandsComponent'
import ArrowsComponent from './ArrowsComponent'
import FuckTextComponent from './FuckTextComponent'
import FakePopUpsComponent from './PopUpComponent'

export default function LandingSection() {
    const [isMobile, setIsMobile] = useState(false)
    const [isPageLoaded, setIsPageLoaded] = useState(false)
    const [reducedMotion, setReducedMotion] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        // Check for reduced motion preference
        const checkReducedMotion = () => {
            setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        }

        checkMobile()
        checkReducedMotion()

        window.addEventListener('resize', checkMobile)

        // Mark page as loaded after a short delay to let critical content render first
        const loadTimer = setTimeout(() => {
            setIsPageLoaded(true)
        }, 500)

        return () => {
            window.removeEventListener('resize', checkMobile)
            clearTimeout(loadTimer)
        }
    }, [])

    // Performance-optimized animation settings
    const getAnimationSettings = () => {
        // Reduce animations on mobile or if user prefers reduced motion
        const shouldReduceAnimations = isMobile || reducedMotion

        return {
            arrows: {
                intensity: shouldReduceAnimations ? 10 : 30,
                speed: shouldReduceAnimations ? 100 : 50
            },
            hands: {
                intensity: shouldReduceAnimations ? 8 : 15,
                speed: shouldReduceAnimations ? 120 : 70
            },
            text: {
                intensity: shouldReduceAnimations ? 20 : 50,
                speed: shouldReduceAnimations ? 80 : 40
            },
            popups: {
                intensity: shouldReduceAnimations ? 10 : 40,
                speed: shouldReduceAnimations ? 150 : 60
            }
        }
    }

    const animationSettings = getAnimationSettings()

    return (
        <div className="relative w-full h-screen">
            {/* Load core animated components first */}
            {isPageLoaded && (
                <>
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

                </>
            )}

            {isPageLoaded && !reducedMotion && (
                <FakePopUpsComponent
                    isMobile={isMobile}
                    wiggleIntensity={animationSettings.popups.intensity}
                    wiggleSpeed={animationSettings.popups.speed}
                />
            )}

            {!isPageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                    <div className="text-white text-2xl font-bold animate-pulse">
                        Loading...
                    </div>
                </div>
            )}
        </div>
    )
}