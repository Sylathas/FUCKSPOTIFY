'use client'

import { useEffect, useState } from 'react'
import LandingSection from '../components/landing/LandingSection'
import TransferUI from '../components/transfer/TransferUI'
import PoliticalDisclaimer from '../components/disclaimer/PoliticalDisclaimerComponent'

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
          backgroundImage: `${isMobile ? "url('/Background_mobile.jpg')" : "url('/Background_desktop.jpg')"}`,
          zIndex: 0,
          backgroundSize: '100% 100%',
          minHeight: '240vh'
        }}
      />

      {/* Section 1: Landing Page with positioned images */}
      <section id="landing" className="relative z-1" style={{ minHeight: `${isMobile ? '800px' : '70vh'}` }}>
        <LandingSection />
      </section>

      {/* Section 2: Transfer UI */}
      <section id="transfer" className="relative z-4" style={{ minHeight: `${isMobile ? '2200px' : '40vh'}` }}>
        <TransferUI />
      </section>

      {/* Section 3: Disclaimer with political statements */}
      <section id="disclaimer" className="relative z-3" style={{ minHeight: `${isMobile ? '1500px' : '140vh'}` }}>
        {/* Background disclaimer image still shows */}
        <div className="absolute inset-0" />

        {/* Political disclaimer overlay at the bottom */}
        <div className="absolute top-0 left-0 right-0" style={{ minHeight: `${isMobile ? '800px' : '20vh'}` }}>
          <PoliticalDisclaimer isMobile={isMobile} />
        </div>
      </section>
    </div>
  )
}