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

    return (
        <div className="relative w-full h-screen">
            {/* Individual components - each will handle their own image and animations */}
            <ArrowsComponent isMobile={isMobile} />
            <HandsComponent isMobile={isMobile} />
            <FuckTextComponent isMobile={isMobile} />
        </div>
    )
}