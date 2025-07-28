'use client'

import LandingSection from '../components/landing/LandingSection'
import TransferUI from '../components/transfer/TransferUI'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black relative" style={{ minHeight: '240vh' }}>
      {/* Background image that covers all sections */}
      <div
        className="absolute inset-0 w-full h-full bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/Background_desktop.png')", // Main background
          zIndex: 0,
          backgroundSize: '100% 100%',
          minHeight: '240vh'
        }}
      />

      {/* Section 1: Landing Page with positioned images */}
      <section id="landing" className="relative" style={{ minHeight: '80vh' }}>
        <LandingSection />
      </section>

      {/* Section 2: Transfer UI */}
      <section id="transfer" className="relative" style={{ minHeight: '50vh' }}>
        <TransferUI />
      </section>

      {/* Section 3: Disclaimer - just empty space, background shows disclaimer */}
      <section id="disclaimer" className="relative" style={{ minHeight: '80vh' }}>
      </section>
    </div>
  )
}