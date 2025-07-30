import { useEffect, useState } from 'react'
import { spotifyAuth } from '@/lib/spotify'

interface SpotifyLoginSectionProps {
    isMobile: boolean
    onLogin: (user: any) => void
    spotifyUser: any
}

export default function SpotifyLoginSection({
    isMobile,
    onLogin,
    spotifyUser
}: SpotifyLoginSectionProps) {
    const [isCheckingAuth, setIsCheckingAuth] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)

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

                // Check if we just returned from mobile login
                const mobileLoginStarted = localStorage.getItem('spotify_login_started')
                if (mobileLoginStarted && isMobile) {
                    console.log('Detected mobile login return, checking for tokens...')
                    localStorage.removeItem('spotify_login_started')
                }

                // First check localStorage for user from callback
                const storedUser = localStorage.getItem('spotify_user')
                if (storedUser) {
                    console.log('Found stored user from callback')
                    try {
                        const user = JSON.parse(storedUser)
                        // Verify this user is still valid by checking tokens
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
                    // Check if we have valid tokens without stored user data
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
                // Clear potentially corrupted data
                spotifyAuth.logout()
                localStorage.removeItem('spotify_user')
            } finally {
                setIsCheckingAuth(false)
            }
        }

        initializeAuth()
    }, [onLogin, spotifyUser, isMobile])

    // Enhanced mobile-friendly login handler
    const handleLogin = async () => {
        try {
            console.log('Starting Spotify login...')
            setAuthError(null)

            // Clear any existing data first
            spotifyAuth.logout()
            localStorage.removeItem('spotify_user')

            console.log('Environment check:', {
                clientId: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ? 'Set' : 'Missing',
                redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || 'Default',
                isMobile: isMobile,
                userAgent: navigator.userAgent
            })

            // Mobile-specific handling
            if (isMobile) {
                // Store a flag to help with mobile return flow
                localStorage.setItem('spotify_login_started', 'true')
                localStorage.setItem('spotify_login_timestamp', Date.now().toString())

                // Add a small delay to ensure localStorage is written
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            await spotifyAuth.redirectToSpotifyLogin()
        } catch (error) {
            console.error('Login failed:', error)
            setAuthError(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
            // Clean up mobile flags on error
            localStorage.removeItem('spotify_login_started')
            localStorage.removeItem('spotify_login_timestamp')
        }
    }

    const handleLogout = () => {
        console.log('Logging out...')
        spotifyAuth.logout()
        localStorage.removeItem('spotify_user')
        localStorage.removeItem('spotify_login_started')
        localStorage.removeItem('spotify_login_timestamp')
        onLogin(null)
        setAuthError(null)
    }

    // FIXED: Single button that shows different images and handles both login/logout
    const handleButtonClick = () => {
        if (isCheckingAuth) return // Don't allow clicks while checking auth

        if (spotifyUser) {
            handleLogout()
        } else {
            handleLogin()
        }
    }

    // Determine which image to show
    const buttonImage = spotifyUser ? "/Buttons/Logout.png" : "/Buttons/Login.png"
    const buttonAlt = spotifyUser ? "Logout from Spotify" : "Login to Spotify"
    const buttonTitle = spotifyUser
        ? `Logged in as ${spotifyUser.name} - Click to logout`
        : (isCheckingAuth ? 'Checking authentication...' : 'Login to Spotify')

    return (
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

            {/* FIXED: Single button that changes image based on login state */}
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
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 
                             text-xs text-green-400 bg-black bg-opacity-50 px-2 py-1 rounded">
                    {spotifyUser.name}
                </div>
            )}
        </div>
    )
}