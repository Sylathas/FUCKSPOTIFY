'use client'

import { useEffect, useState } from 'react'
import LandingSection from '../components/landing/LandingSection'
import TransferUI from '../components/transfer/TransferUI'

export default function HomePage() {
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
    <div className="min-h-screen bg-black relative" style={{ minHeight: '240vh' }}>
      {/* Background image that covers all sections */}
      <div
        className="absolute inset-0 w-full h-full bg-center bg-no-repeat"
        style={{
          backgroundImage: `${isMobile ? "url('/Background_mobile.jpg')" : "url('/Background_desktop.jpg')"}`, // Main background
          zIndex: 0,
          backgroundSize: '100% 100%',
          minHeight: '240vh'
        }}
      />

      {/* Section 1: Landing Page with positioned images */}
      <section id="landing" className="relative" style={{ minHeight: `${isMobile ? '800px' : '80vh'}` }}>
        <LandingSection />
      </section>

      {/* Section 2: Transfer UI */}
      <section id="transfer" className="relative" style={{ minHeight: `${isMobile ? '2000px' : '50vh'}` }}>
        <TransferUI />
      </section>

      {/* Section 3: Disclaimer - just empty space, background shows disclaimer */}
      <section id="disclaimer" className="relative" style={{ minHeight: `${isMobile ? '800px' : '50vh'}` }}>
      </section>
    </div>
  )
}