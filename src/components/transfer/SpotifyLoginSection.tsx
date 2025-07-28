import { useEffect } from 'react'
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

    // Check for existing authentication when component loads
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                console.log('Initializing Spotify auth...')

                // First check localStorage for user from callback
                const storedUser = localStorage.getItem('spotify_user')
                if (storedUser && !spotifyUser) {
                    console.log('Found stored user:', JSON.parse(storedUser))
                    onLogin(JSON.parse(storedUser))
                    return
                }

                // Then check if we have valid tokens
                const existingUser = await spotifyAuth.checkExistingLogin()
                if (existingUser && !spotifyUser) {
                    console.log('Found existing valid session:', existingUser)
                    onLogin(existingUser)
                }
            } catch (error) {
                console.error('Auth initialization error:', error)
            }
        }

        initializeAuth()
    }, [onLogin, spotifyUser])

    const handleLogin = async () => {
        try {
            console.log('Starting Spotify login...')
            console.log('Client ID:', process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID)
            console.log('Redirect URI:', process.env.NEXT_PUBLIC_REDIRECT_URI)

            await spotifyAuth.redirectToSpotifyLogin()
        } catch (error) {
            console.error('Login failed:', error)
            alert(`Login failed: ${error}`)
        }
    }

    const handleLogout = () => {
        console.log('Logging out...')
        spotifyAuth.logout()
        localStorage.removeItem('spotify_user')
        onLogin(null)
    }

    return (
        <div
            className={`
        relative bg-cover bg-center bg-no-repeat
        flex items-center justify-center
        ${isMobile ? 'h-full' : 'h-full'}
      `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')", // UI background image
                backgroundSize: '100% 100%' // Stretch to fit
            }}
        >
            {/* Login Button Image */}
            {spotifyUser ? (
                <img
                    src="/Buttons/Logged.png" // Your "logged in" button image
                    alt="Spotify Connected"
                    className={`
            ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-[20%]'}
            cursor-pointer hover:opacity-80 transition-opacity
          `}
                />
            ) : (
                <img
                    src="/Buttons/Login.png" // Your "login" button image
                    alt="Login to Spotify"
                    onClick={handleLogin}
                    className={`
            ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-[20%]'}
            cursor-pointer hover:opacity-80 transition-opacity
          `}
                />
            )}
        </div>
    )
}