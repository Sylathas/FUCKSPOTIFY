'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { spotifyAuth } from '@/lib/spotify'

function CallbackContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [status, setStatus] = useState('Processing login...')

    useEffect(() => {
        const handleCallback = async () => {
            try {
                const code = searchParams.get('code')
                const state = searchParams.get('state')
                const error = searchParams.get('error')

                console.log('=== SPOTIFY CALLBACK ===')
                console.log('URL params:', { code: !!code, state: !!state, error })
                console.log('User agent:', navigator.userAgent)
                console.log('Is mobile:', /iPhone|iPad|iPod|Android/i.test(navigator.userAgent))

                if (error) {
                    setStatus(`Login failed: ${error}`)
                    // Clean up any mobile login flags
                    localStorage.removeItem('spotify_login_started')
                    localStorage.removeItem('spotify_login_timestamp')
                    setTimeout(() => {
                        console.log('Redirecting to home due to error')
                        router.push('/')
                    }, 3000)
                    return
                }

                if (!code || !state) {
                    setStatus('Invalid callback parameters')
                    // Clean up any mobile login flags
                    localStorage.removeItem('spotify_login_started')
                    localStorage.removeItem('spotify_login_timestamp')
                    setTimeout(() => {
                        console.log('Redirecting to home due to missing params')
                        router.push('/')
                    }, 3000)
                    return
                }

                setStatus('Exchanging code for access token...')
                console.log('Attempting to handle callback...')

                const user = await spotifyAuth.handleCallback(code, state)
                console.log('Callback successful, user:', user.name)

                setStatus(`Welcome ${user.name}! Redirecting...`)

                // Store user data
                localStorage.setItem('spotify_user', JSON.stringify(user))

                // Clean up mobile login flags
                localStorage.removeItem('spotify_login_started')
                localStorage.removeItem('spotify_login_timestamp')

                // For mobile, use a slightly longer delay to ensure everything is saved
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                const delay = isMobile ? 2000 : 1000

                setTimeout(() => {
                    console.log('Redirecting to home after successful login')
                    // Force a hard navigation on mobile to ensure proper page reload
                    if (isMobile) {
                        window.location.href = '/'
                    } else {
                        router.push('/')
                    }
                }, delay)

            } catch (error) {
                console.error('Callback error:', error)
                setStatus(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`)

                // Clean up any mobile login flags
                localStorage.removeItem('spotify_login_started')
                localStorage.removeItem('spotify_login_timestamp')

                setTimeout(() => {
                    console.log('Redirecting to home due to callback error')
                    router.push('/')
                }, 3000)
            }
        }

        handleCallback()
    }, [searchParams, router])

    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center max-w-md px-4">
                <div className="text-green-400 text-xl mb-4">🎵 Spotify Login</div>
                <div className="text-green-300 mb-4">{status}</div>
                <div className="mb-4">
                    <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>

                {/* Mobile-specific help text */}
                <div className="text-gray-400 text-xs">
                    Please wait while we complete your login...
                </div>

                {/* Fallback button for mobile if redirect fails */}
                <button
                    onClick={() => {
                        console.log('Manual redirect triggered')
                        window.location.href = '/'
                    }}
                    className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline"
                >
                    Return to app manually
                </button>
            </div>
        </div>
    )
}

export default function SpotifyCallback() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="text-green-400 text-xl mb-4">Loading...</div>
                    <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
            </div>
        }>
            <CallbackContent />
        </Suspense>
    )
}