'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { spotifyAuth } from '@/lib/spotify'

export default function SpotifyCallback() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [status, setStatus] = useState('Processing login...')

    useEffect(() => {
        const handleCallback = async () => {
            try {
                const code = searchParams.get('code')
                const state = searchParams.get('state')
                const error = searchParams.get('error')

                if (error) {
                    setStatus(`Login failed: ${error}`)
                    setTimeout(() => router.push('/'), 3000)
                    return
                }

                if (!code || !state) {
                    setStatus('Invalid callback parameters')
                    setTimeout(() => router.push('/'), 3000)
                    return
                }

                setStatus('Exchanging code for access token...')
                const user = await spotifyAuth.handleCallback(code, state)

                setStatus(`Welcome ${user.name}! Redirecting...`)

                // Store user data and redirect back to main page
                localStorage.setItem('spotify_user', JSON.stringify(user))
                setTimeout(() => router.push('/'), 1000)

            } catch (error) {
                console.error('Callback error:', error)
                setStatus(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
                setTimeout(() => router.push('/'), 3000)
            }
        }

        handleCallback()
    }, [searchParams, router])

    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
                <div className="text-green-400 text-xl mb-4">Spotify Login</div>
                <div className="text-green-300">{status}</div>
                <div className="mt-4">
                    <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
            </div>
        </div>
    )
}