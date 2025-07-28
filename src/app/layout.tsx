import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
//import AccessibilityControls from '@/components/ui/AccessibilityControls'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FuckSpotify - Transfer Your Music',
  description: 'Transfer your music from Spotify to other streaming platforms',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-green-400 overflow-x-hidden`}>
        <main className="relative">
          {children}
        </main>
      </body>
    </html>
  )
}