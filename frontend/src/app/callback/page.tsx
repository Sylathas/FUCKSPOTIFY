'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { spotifyAuth } from '@/lib/spotify'

// Dynamic Client ID helper (same as in your login component)
const getClientId = (): string => {
    // Try environment variable first (your main app)
    const envClientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
    if (envClientId) return envClientId

    // Fall back to user-provided credentials
    if (typeof window !== 'undefined') {
        const userClientId = localStorage.getItem('spotify_user_client_id')
        if (userClientId) return userClientId
    }

    throw new Error('No Spotify Client ID configured')
}

const getRedirectUri = (): string => {
    if (typeof window === 'undefined') return 'http://localhost:3000/callback'
    return `${window.location.origin}/callback`
}

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
                    localStorage.removeItem('spotify_login_started')
                    localStorage.removeItem('spotify_login_timestamp')
                    setTimeout(() => {
                        console.log('Redirecting to home due to missing params')
                        router.push('/')
                    }, 3000)
                    return
                }

                // Verify state matches
                const storedState = sessionStorage.getItem('spotify_auth_state')
                if (state !== storedState) {
                    setStatus('State mismatch - possible security issue')
                    setTimeout(() => router.push('/'), 3000)
                    return
                }

                const codeVerifier = sessionStorage.getItem('code_verifier')
                if (!codeVerifier) {
                    setStatus('Code verifier not found - please try logging in again')
                    setTimeout(() => router.push('/'), 3000)
                    return
                }

                setStatus('Exchanging code for access token...')
                console.log('Attempting to handle callback with dynamic client ID...')

                try {
                    // Get the dynamic client ID (same one used for login)
                    const clientId = getClientId()
                    const redirectUri = getRedirectUri()

                    console.log('Using client ID:', clientId ? 'Found' : 'Missing')
                    console.log('Using redirect URI:', redirectUri)

                    // Exchange authorization code for access token using PKCE
                    const response = await fetch('https://accounts.spotify.com/api/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({
                            grant_type: 'authorization_code',
                            code: code,
                            redirect_uri: redirectUri,
                            client_id: clientId,  // Use dynamic client ID
                            code_verifier: codeVerifier,
                        }),
                    })

                    const responseText = await response.text()
                    console.log('Token exchange response:', {
                        status: response.status,
                        statusText: response.statusText,
                        bodyPreview: responseText.substring(0, 100) + '...'
                    })

                    if (!response.ok) {
                        let errorDetails = responseText
                        try {
                            const errorData = JSON.parse(responseText)
                            errorDetails = errorData.error_description || errorData.error || responseText
                        } catch (e) {
                            // Use raw response if not JSON
                        }
                        throw new Error(`Token exchange failed (${response.status}): ${errorDetails}`)
                    }

                    const tokenData = JSON.parse(responseText)

                    // Store tokens
                    localStorage.setItem('spotify_access_token', tokenData.access_token)
                    localStorage.setItem('spotify_refresh_token', tokenData.refresh_token)
                    localStorage.setItem('spotify_token_expires',
                        (Date.now() + tokenData.expires_in * 1000).toString()
                    )

                    console.log('Tokens stored successfully')

                    // Clean up PKCE data
                    sessionStorage.removeItem('spotify_auth_state')
                    sessionStorage.removeItem('code_verifier')

                    // Get user profile using the new token
                    const userResponse = await fetch('https://api.spotify.com/v1/me', {
                        headers: {
                            'Authorization': `Bearer ${tokenData.access_token}`
                        }
                    })

                    if (!userResponse.ok) {
                        throw new Error('Failed to get user profile')
                    }

                    const userProfile = await userResponse.json()
                    console.log('Got user profile:', userProfile.display_name)

                    const user = {
                        id: userProfile.id,
                        name: userProfile.display_name,
                        email: userProfile.email,
                        image: userProfile.images?.[0]?.url,
                        followers: userProfile.followers?.total
                    }

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

                } catch (tokenError) {
                    console.error('Token exchange error:', tokenError)

                    // More specific error handling
                    let errorMessage = 'Login failed'
                    if (tokenError instanceof Error) {
                        if (tokenError.message.includes('consumer')) {
                            errorMessage = 'App configuration issue - please check your Spotify app setup'
                        } else if (tokenError.message.includes('expired')) {
                            errorMessage = 'Login session expired - please try again'
                        } else {
                            errorMessage = `Login failed: ${tokenError.message}`
                        }
                    }

                    setStatus(errorMessage)

                    // Clean up on error
                    sessionStorage.removeItem('spotify_auth_state')
                    sessionStorage.removeItem('code_verifier')
                    localStorage.removeItem('spotify_login_started')
                    localStorage.removeItem('spotify_login_timestamp')

                    setTimeout(() => {
                        console.log('Redirecting to home due to token error')
                        router.push('/')
                    }, 4000)
                }

            } catch (error) {
                console.error('Callback error:', error)
                setStatus(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`)

                // Clean up any login flags
                localStorage.removeItem('spotify_login_started')
                localStorage.removeItem('spotify_login_timestamp')
                sessionStorage.removeItem('spotify_auth_state')
                sessionStorage.removeItem('code_verifier')

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

                {/* Debug info for troubleshooting */}
                <div className="mt-4 text-xs text-gray-500">
                    <details>
                        <summary className="cursor-pointer hover:text-gray-400">Debug Info</summary>
                        <div className="mt-2 text-left bg-gray-900 p-2 rounded">
                            <div>Client ID: {getClientId() ? '✓ Found' : '❌ Missing'}</div>
                            <div>Redirect URI: {getRedirectUri()}</div>
                            <div>User Agent: {navigator.userAgent.substring(0, 50)}...</div>
                        </div>
                    </details>
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