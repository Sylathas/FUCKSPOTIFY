import { useEffect, useState } from 'react'
import { spotifyAuth } from '@/lib/spotify'

interface SpotifyLoginSectionProps {
    isMobile: boolean
    onLogin: (user: any) => void
    spotifyUser: any
}

// Auth Helper Functions - FIXED
const DynamicSpotifyAuth = {
    getClientId(): string | null {
        if (typeof window !== 'undefined') {
            const userClientId = localStorage.getItem('spotify_user_client_id')
            if (userClientId && userClientId.trim() && userClientId.length >= 32) {
                return userClientId.trim()
            }
        }
        return null
    },

    hasCredentials(): boolean {
        const clientId = this.getClientId()
        // Additional validation - client ID should be at least 32 characters (Spotify client IDs are 32 chars)
        return clientId !== null && clientId.length >= 32
    },

    // FIXED: Always use the same redirect URI that users put in their Spotify app
    getRedirectUri(): string {
        return 'https://fuckspotify.netlify.app/callback'
    }
}

// Overlay Component - FIXED redirect URI
function SpotifySetupOverlay({ isMobile, onClose, onSetupComplete }: {
    isMobile: boolean
    onClose: () => void
    onSetupComplete: () => void
}) {
    const [clientId, setClientId] = useState('')
    const [currentStep, setCurrentStep] = useState(0)

    const disclaimers = [
        {
            title: 'The Streaming Economics Reality',
            content: `The "pay per stream" metric is misleading. Artists are paid from a pool system where ~65% of Spotify's revenue (11B+ in 2024) goes to distributors and labels, then trickles down to artists. With 20k+ new songs added daily, AI-generated content increasingly dilutes this pool, reducing payments even if your streams stay constant. Streaming simply isn't viable for most artists.`,
            link: { url: 'https://musically.com/2020/05/05/spotify-should-pay-musicians-more-lets-talk-about-how/', text: 'Learn more about streaming economics' }
        },
        {
            title: 'The AI Warfare Connection',
            content: `Spotify CEO Daniel Ek's investment company Prima Materia invested 600M in Helsing AI, an AI warfare technology company. While they claim to only work with "democracies" (self-defined), this connects music streaming profits to military technology. Artists earn pennies while platforms invest in warfare systems.`,
            link: null
        },
        {
            title: 'Why This Matters',
            content: `Moving away from Spotify isn't just about music: it's about where your money goes. When done at scale, platform migration demonstrates consumer power and can influence corporate priorities. This tool helps you reclaim control over your music and your values.`,
            link: null
        }
    ]

    const steps = [
        {
            title: "Go to Spotify Developer Dashboard",
            content: "Visit developer.spotify.com/dashboard and log in with your Spotify account",
            action: (
                <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm inline-block"
                >
                    Open Spotify Dashboard
                </a>
            )
        },
        {
            title: "Create a New App",
            content: "Click 'Create App' and use any name (e.g., 'My Music Transfer')",
            action: (
                <div className="text-gray-400 text-sm">
                    Suggested name: "Personal Music Transfer Tool"
                </div>
            )
        },
        {
            title: "Add Redirect URI",
            content: "In your app settings, add this exact Redirect URI:",
            action: (
                <div className="space-y-2">
                    <div className="bg-gray-800 p-2 rounded font-mono text-sm text-green-400 border">
                        https://fuckspotify.netlify.app/callback
                    </div>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText('https://fuckspotify.netlify.app/callback')
                            alert('Copied to clipboard!')
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
                    >
                        Copy URI
                    </button>
                </div>
            )
        },
        {
            title: "Get Your Client ID",
            content: "Copy the Client ID from your app dashboard (NOT the Client Secret)",
            action: (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Paste your Client ID here (32 characters)"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                    />
                    {clientId && clientId.length < 32 && (
                        <div className="text-yellow-400 text-xs">
                            ⚠️ Client ID should be 32 characters long. Make sure you copied the Client ID, not the Client Secret.
                        </div>
                    )}
                    <button
                        onClick={() => {
                            if (clientId.trim() && clientId.trim().length >= 32) {
                                localStorage.setItem('spotify_user_client_id', clientId.trim())
                                console.log('Saved client ID:', clientId.trim().substring(0, 8) + '...')
                                onSetupComplete()
                                onClose()
                            }
                        }}
                        disabled={!clientId.trim() || clientId.trim().length < 32}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded w-full"
                    >
                        Save & Start Using App
                    </button>
                </div>
            )
        }
    ]

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
            <div className={`bg-gray-900 rounded-lg border border-gray-700 max-w-6xl w-full max-h-[90vh] overflow-hidden ${isMobile ? 'flex flex-col' : 'flex flex-row'}`}>

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl z-10"
                >
                    ×
                </button>

                {/* Left side - Disclaimers (Desktop) / Top (Mobile) */}
                <div className={`${isMobile ? 'w-full' : 'w-1/2'} p-6 ${isMobile ? 'border-b border-gray-700 max-h-[40vh] overflow-y-auto' : 'border-r border-gray-700'}`}>
                    <h3 className="text-xl text-yellow-400 font-bold mb-2">Why FuckSpotify?</h3>
                    <p className="text-gray-300 text-sm mb-4">
                        Spotify won't expand my app's userbase (though I'm working on it), so you'll need to create your own Spotify app. Here's why it's worth the 2-minute setup:
                    </p>

                    <div className="space-y-4">
                        {disclaimers.map((disclaimer, index) => (
                            <div key={index} className="border border-gray-600 rounded p-3">
                                <h4 className="text-white font-medium mb-2 text-sm">
                                    {disclaimer.title}
                                </h4>
                                <p className="text-gray-400 text-xs leading-relaxed mb-2">
                                    {disclaimer.content}
                                </p>
                                {disclaimer.link && (
                                    <a
                                        href={disclaimer.link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block text-blue-400 hover:text-blue-300 text-xs underline"
                                    >
                                        {disclaimer.link.text}
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right side - Setup (Desktop) / Bottom (Mobile) */}
                <div className={`${isMobile ? 'w-full flex-1' : 'w-1/2'} p-6 ${isMobile ? 'overflow-y-auto' : ''}`}>
                    <h3 className="text-xl text-green-400 font-bold mb-2">Quick Spotify Setup</h3>
                    <p className="text-gray-300 mb-4 text-sm">
                        Create your personal Spotify app while I work on getting the main app approved (2 minutes, one-time setup)
                    </p>

                    {/* Progress bar */}
                    <div className="mb-6">
                        <div className="flex justify-between mb-2">
                            {steps.map((_, index) => (
                                <div
                                    key={index}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${index <= currentStep
                                        ? 'bg-green-600 text-white'
                                        : 'bg-gray-700 text-gray-400'
                                        }`}
                                >
                                    {index + 1}
                                </div>
                            ))}
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Current step */}
                    <div className="border border-gray-700 rounded-lg p-4 mb-4">
                        <h4 className="text-white font-medium mb-2 text-sm">
                            Step {currentStep + 1}: {steps[currentStep].title}
                        </h4>
                        <p className="text-gray-400 mb-3 text-sm">{steps[currentStep].content}</p>
                        {steps[currentStep].action}
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between">
                        <button
                            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                            disabled={currentStep === 0}
                            className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white px-4 py-2 rounded text-sm"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                            disabled={currentStep === steps.length - 1}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 text-white px-4 py-2 rounded text-sm"
                        >
                            Next
                        </button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h5 className="text-yellow-400 text-sm mb-2">Privacy & Security</h5>
                        <p className="text-gray-400 text-xs leading-relaxed">
                            Your credentials stay on your device and only connect to YOUR Spotify account.
                            This setup gives you a personal app with no rate limits or restrictions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function SpotifyLoginSection({
    isMobile,
    onLogin,
    spotifyUser
}: SpotifyLoginSectionProps) {
    const [isCheckingAuth, setIsCheckingAuth] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)
    const [showOverlay, setShowOverlay] = useState(false)

    // Check for existing authentication when component loads
    useEffect(() => {
        const initializeAuth = async () => {
            if (spotifyUser) {
                console.log('User already logged in, skipping auth check')
                return
            }

            setIsCheckingAuth(true)
            setAuthError(null)

            try {
                console.log('Initializing Spotify auth...')
                console.log('Has credentials:', DynamicSpotifyAuth.hasCredentials())
                console.log('Client ID available:', !!DynamicSpotifyAuth.getClientId())

                const mobileLoginStarted = localStorage.getItem('spotify_login_started')
                if (mobileLoginStarted && isMobile) {
                    console.log('Detected mobile login return, checking for tokens...')
                    localStorage.removeItem('spotify_login_started')
                }

                const storedUser = localStorage.getItem('spotify_user')
                if (storedUser) {
                    console.log('Found stored user from callback')
                    try {
                        const user = JSON.parse(storedUser)
                        const existingUser = await spotifyAuth.checkExistingLogin()
                        if (existingUser) {
                            console.log('Stored user is valid:', user.name)
                            onLogin(user)
                        } else {
                            console.log('Stored user is invalid, clearing')
                            localStorage.removeItem('spotify_user')
                        }
                    } catch (error) {
                        console.error('Error parsing stored user:', error)
                        localStorage.removeItem('spotify_user')
                    }
                } else {
                    console.log('No stored user, checking for valid tokens...')
                    const existingUser = await spotifyAuth.checkExistingLogin()
                    if (existingUser) {
                        console.log('Found existing valid session:', existingUser.name)
                        localStorage.setItem('spotify_user', JSON.stringify(existingUser))
                        onLogin(existingUser)
                    } else {
                        console.log('No valid session found')
                    }
                }
            } catch (error) {
                console.error('Auth initialization error:', error)
                setAuthError(`Auth check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
                spotifyAuth.logout()
                localStorage.removeItem('spotify_user')
            } finally {
                setIsCheckingAuth(false)
            }
        }

        initializeAuth()
    }, [onLogin, spotifyUser, isMobile])

    // Credential checking with validation
    const handleLogin = async () => {
        console.log('=== LOGIN BUTTON CLICKED ===')

        // Check if we have valid credentials
        if (!DynamicSpotifyAuth.hasCredentials()) {
            console.log('No valid client ID found, showing setup overlay')
            setShowOverlay(true)
            return
        }

        const clientId = DynamicSpotifyAuth.getClientId()
        console.log('Using valid client ID:', clientId?.substring(0, 8) + '...')

        try {
            console.log('Starting Spotify login with validated client ID')
            setAuthError(null)

            // FIXED: Use the correct redirect URI
            const redirectUri = DynamicSpotifyAuth.getRedirectUri()
            console.log('Using redirect URI:', redirectUri)

            const state = generateRandomString(16)
            sessionStorage.setItem('spotify_auth_state', state)

            const codeVerifier = generateRandomString(128)
            sessionStorage.setItem('code_verifier', codeVerifier)

            const codeChallenge = await generateCodeChallenge(codeVerifier)

            const params = new URLSearchParams({
                response_type: 'code',
                client_id: clientId!,
                scope: 'user-read-private user-read-email user-library-read playlist-read-private playlist-read-collaborative',
                redirect_uri: redirectUri,
                state: state,
                code_challenge_method: 'S256',
                code_challenge: codeChallenge,
            })

            if (isMobile) {
                localStorage.setItem('spotify_login_started', 'true')
                localStorage.setItem('spotify_login_timestamp', Date.now().toString())
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`
            console.log('Redirecting to Spotify:', authUrl.substring(0, 100) + '...')
            window.location.href = authUrl

        } catch (error) {
            console.error('Login failed:', error)
            setAuthError(`Login failed: ${error instanceof Error ? error.message : 'Setup might be needed'}`)
        }
    }

    const handleLogout = () => {
        console.log('Logging out...')
        spotifyAuth.logout()
        localStorage.removeItem('spotify_user')
        localStorage.removeItem('spotify_login_started')
        localStorage.removeItem('spotify_login_timestamp')
        // Also clear user client ID if they want to start fresh
        // localStorage.removeItem('spotify_user_client_id')
        onLogin(null)
        setAuthError(null)
    }

    const handleButtonClick = () => {
        if (isCheckingAuth) return

        if (spotifyUser) {
            handleLogout()
        } else {
            handleLogin() // This will show overlay if no valid credentials
        }
    }

    const handleSetupComplete = () => {
        console.log('Setup completed, attempting login...')
        // Credentials are now saved, user can try actual login
        handleLogin()
    }

    // Determine which image to show
    const buttonImage = spotifyUser ? "/Buttons/Logout.png" : "/Buttons/Login.png"
    const buttonAlt = spotifyUser ? "Logout from Spotify" : "Login to Spotify"
    const buttonTitle = spotifyUser
        ? `Logged in as ${spotifyUser.name} - Click to logout`
        : (isCheckingAuth ? 'Checking authentication...' : 'Login to Spotify')

    return (
        <>
            <div
                className={`
                    relative bg-cover bg-center bg-no-repeat
                    flex flex-col items-center justify-center
                    ${isMobile ? 'h-[200px]' : 'h-full'}
                `}
                style={{
                    backgroundImage: "url('/Buttons/UI_Background.png')",
                    backgroundSize: '100% 100%'
                }}
            >
                {/* Loading indicator during auth check */}
                {isCheckingAuth && (
                    <div className="absolute top-2 right-2">
                        <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                    </div>
                )}

                {/* Error message */}
                {authError && (
                    <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-xs p-2 text-center">
                        {authError}
                        <button
                            onClick={() => setAuthError(null)}
                            className="ml-2 text-red-200 hover:text-white"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Debug info to help you see what's happening */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="absolute top-2 left-2 text-xs text-gray-400 bg-black bg-opacity-50 p-1 rounded">
                        Valid ID: {DynamicSpotifyAuth.hasCredentials() ? '✓' : '❌'}
                    </div>
                )}

                {/* Main login/logout button */}
                <img
                    src={buttonImage}
                    alt={buttonAlt}
                    onClick={handleButtonClick}
                    className={`
                        ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-[20%]'}
                        transition-opacity
                        ${isCheckingAuth ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}
                    `}
                    title={buttonTitle}
                />

                {/* Status text for logged in user */}
                {spotifyUser && (
                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 
                                 text-xs text-green-400 bg-black/50 px-2 py-1 rounded">
                        {spotifyUser.name}
                    </div>
                )}
            </div>

            {/* Setup Overlay */}
            {showOverlay && (
                <SpotifySetupOverlay
                    isMobile={isMobile}
                    onClose={() => setShowOverlay(false)}
                    onSetupComplete={handleSetupComplete}
                />
            )}
        </>
    )
}

// Helper functions
function generateRandomString(length: number): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const base64String = btoa(String.fromCharCode(...new Uint8Array(digest)))
    return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}