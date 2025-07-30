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
    const [showDevModeNotice, setShowDevModeNotice] = useState(false)
    const [userEmail, setUserEmail] = useState('')

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

    const handleLogin = async () => {
        // Show development mode notice instead of trying to login
        setShowDevModeNotice(true)
    }

    const handleActualLogin = async () => {
        try {
            console.log('Starting Spotify login...')
            setAuthError(null)
            setShowDevModeNotice(false)

            spotifyAuth.logout()
            localStorage.removeItem('spotify_user')

            if (isMobile) {
                localStorage.setItem('spotify_login_started', 'true')
                localStorage.setItem('spotify_login_timestamp', Date.now().toString())
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            await spotifyAuth.redirectToSpotifyLogin()
        } catch (error) {
            console.error('Login failed:', error)
            setAuthError(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

    const handleButtonClick = () => {
        if (isCheckingAuth) return

        if (spotifyUser) {
            handleLogout()
        } else {
            handleLogin() // This now shows the notice first
        }
    }

    const handleRequestAccess = () => {
        if (userEmail.trim()) {
            // Create mailto link for easy contact
            const subject = encodeURIComponent('FuckSpotify App Access Request')
            const body = encodeURIComponent(`Hi!

I'd like access to the FuckSpotify music transfer app.

My Spotify email: ${userEmail.trim()}

Please add me to the allowed users list.

Thanks!`)

            const mailtoLink = `mailto:abate.niccolo@gmail.com?subject=${subject}&body=${body}`
            window.open(mailtoLink)

            setShowDevModeNotice(false)
            setUserEmail('')
        }
    }

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
            {/* Development Mode Notice Modal */}
            {showDevModeNotice && (
                <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center z-20 p-4">
                    <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full border border-yellow-600">
                        <div className="text-center mb-4">
                            <div className="text-4xl mb-2">⚠️</div>
                            <h3 className="text-yellow-400 font-bold text-lg">App in Development Mode</h3>
                        </div>

                        <div className="text-gray-300 text-sm space-y-3 mb-6">
                            <p>
                                This app is currently in Spotify's development mode, which means only pre-approved users can log in.
                            </p>
                            <p>
                                <strong className="text-yellow-400">Why?</strong> Spotify requires manual approval for apps with... creative names like this lol
                            </p>
                            <p>
                                <strong className="text-green-400">Solution:</strong> Send me your Spotify email and I'll add you to the approved users list!
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-gray-300 text-sm mb-2">
                                    Your Spotify email address:
                                </label>
                                <input
                                    type="email"
                                    value={userEmail}
                                    onChange={(e) => setUserEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                                />
                            </div>

                            <div className="flex space-x-2">
                                <button
                                    onClick={handleRequestAccess}
                                    disabled={!userEmail.trim()}
                                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm"
                                >
                                    Request Access
                                </button>
                                <button
                                    onClick={handleActualLogin}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
                                >
                                    Try Anyway
                                </button>
                            </div>

                            <button
                                onClick={() => setShowDevModeNotice(false)}
                                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm"
                            >
                                Cancel
                            </button>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <p className="text-gray-400 text-xs text-center">
                                Make sure to use the same email as your Spotify account
                            </p>
                        </div>
                    </div>
                </div>
            )}

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
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 
                             text-xs text-green-400 bg-black bg-opacity-50 px-2 py-1 rounded">
                    {spotifyUser.name}
                </div>
            )}
        </div>
    )
}