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
    }, [onLogin, spotifyUser])

    const handleLogin = async () => {
        try {
            console.log('Starting Spotify login...')
            setAuthError(null)

            // Clear any existing data first
            spotifyAuth.logout()
            localStorage.removeItem('spotify_user')

            console.log('Environment check:', {
                clientId: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ? 'Set' : 'Missing',
                redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || 'Default'
            })

            await spotifyAuth.redirectToSpotifyLogin()
        } catch (error) {
            console.error('Login failed:', error)
            setAuthError(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    const handleLogout = () => {
        console.log('Logging out...')
        spotifyAuth.logout()
        localStorage.removeItem('spotify_user')
        onLogin(null)
        setAuthError(null)
    }

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

            {/* Login Button Image */}
            {spotifyUser ? (
                <div className="relative">
                    <img
                        src="/Buttons/Logged.png"
                        alt="Spotify Connected"
                        className={`
                            ${isMobile ? 'w-[90%] h-auto' : 'w-[90%] h-[20%]'}
                            cursor-pointer hover:opacity-80 transition-opacity
                        `}
                        title={`Logged in as ${spotifyUser.name}`}
                    />
                    {/* Logout option */}
                    <button
                        onClick={handleLogout}
                        className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 
                                 text-xs text-red-400 hover:text-red-300 transition-colors
                                 bg-black bg-opacity-50 px-2 py-1 rounded"
                        title="Logout from Spotify"
                    >
                        Logout
                    </button>
                </div>
            ) : (
                <img
                    src="/Buttons/Login.png"
                    alt="Login to Spotify"
                    onClick={handleLogin}
                    className={`
                        ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-[20%]'}
                        cursor-pointer hover:opacity-80 transition-opacity
                        ${isCheckingAuth ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    title={isCheckingAuth ? 'Checking authentication...' : 'Login to Spotify'}
                />
            )}
        </div>
    )
}