import { useEffect, useState } from 'react'
import { spotifyAuth } from '@/lib/spotify'

interface SpotifyLoginProps {
    isMobile: boolean
    onLogin: (user: any) => void
    spotifyUser: any
}

// Simple auth utilities
const getClientId = (): string | null => {
    if (typeof window === 'undefined') return null
    const id = localStorage.getItem('spotify_user_client_id')?.trim()
    return id && id.length >= 32 ? id : null
}

const hasClientId = () => !!getClientId()

const saveClientId = (id: string) => {
    localStorage.setItem('spotify_user_client_id', id.trim())
}

const generateRandomString = (length: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const generateCodeChallenge = async (verifier: string) => {
    const data = new TextEncoder().encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Setup modal component
const SetupModal = ({ isMobile, onClose, onComplete }: {
    isMobile: boolean
    onClose: () => void
    onComplete: () => void
}) => {
    const [clientId, setClientId] = useState('')
    const [step, setStep] = useState(0)

    const steps = [
        "Go to developer.spotify.com/dashboard",
        "Create a new app with any name",
        "Add redirect URI: https://fuckspotify.netlify.app/callback",
        "Copy your Client ID (32 characters)"
    ]

    const handleSave = () => {
        if (clientId.trim().length >= 32) {
            saveClientId(clientId)
            onComplete()
            onClose()
        }
    }

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
            <div className="bg-cover bg-center bg-no-repeat max-w-lg w-full p-10"
                style={{
                    backgroundImage: "url('/Buttons/UI_Background_Big.png')",
                    backgroundSize: '100% 100%',
                }}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-black bg-stronggreen">Spotify Setup</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
                </div>

                <div className="mb-4">
                    <div className="text-sm text-white mb-2">Step {step + 1} of {steps.length}</div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                        <div
                            className="bg-stronggreen h-2 transition-all"
                            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
                        />
                    </div>
                    <p className="text-white-300 text-sm">{steps[step]}</p>
                </div>

                {step === 0 && (
                    <a
                        href="https://developer.spotify.com/dashboard"
                        target="_blank"
                        className="bg-stronggreen text-black hover:bg-stronggreen/80 px-4 py-2 text-sm inline-block mb-4"
                    >
                        Open Dashboard
                    </a>
                )}

                {step === 2 && (
                    <div className="mb-4">
                        <div className="bg-gray-800 p-2 rounded text-sm font-mono text-green-400 mb-2">
                            https://fuckspotify.netlify.app/callback
                        </div>
                        <button
                            onClick={() => navigator.clipboard.writeText('https://fuckspotify.netlify.app/callback')}
                            className="bg-stronggreen hover:bg-stronggreen/80 text-black px-3 py-1 text-xs"
                        >
                            Copy
                        </button>
                    </div>
                )}

                {step === 3 && (
                    <div className="mb-4">
                        <input
                            type="text"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="Paste Client ID here"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white text-sm mb-2"
                        />
                        {clientId && clientId.length < 32 && (
                            <p className="text-yellow-400 text-xs">Client ID should be 32 characters</p>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={clientId.length < 32}
                            className="bg-stronggreen hover:bg-stronggreen/80 disabled:bg-gray-600 text-black px-4 py-2 w-full"
                        >
                            Save & Continue
                        </button>
                    </div>
                )}

                <div className="flex justify-between">
                    <button
                        onClick={() => setStep(Math.max(0, step - 1))}
                        disabled={step === 0}
                        className="bg-strongred hover:bg-strongred/80 disabled:bg-gray-800 text-white px-4 py-2 text-sm"
                    >
                        Back
                    </button>
                    {step < 3 && (
                        <button
                            onClick={() => setStep(Math.min(3, step + 1))}
                            className="bg-strongblue hover:bg-strongblue/80 text-white px-4 py-2 text-sm"
                        >
                            Next
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// Main component
export default function SpotifyLoginSection({ isMobile, onLogin, spotifyUser }: SpotifyLoginProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showSetup, setShowSetup] = useState(false)

    // Check for existing login on mount
    useEffect(() => {
        if (spotifyUser) return

        const checkAuth = async () => {
            setIsLoading(true)
            try {
                // Check stored user
                const stored = localStorage.getItem('spotify_user')
                if (stored) {
                    const user = JSON.parse(stored)
                    const existing = await spotifyAuth.checkExistingLogin()
                    if (existing) {
                        onLogin(user)
                        setIsLoading(false)
                        return
                    }
                    localStorage.removeItem('spotify_user')
                }

                // Check for valid session
                const existing = await spotifyAuth.checkExistingLogin()
                if (existing) {
                    localStorage.setItem('spotify_user', JSON.stringify(existing))
                    onLogin(existing)
                }
            } catch (err) {
                console.error('Auth check failed:', err)
                setError('Authentication check failed')
            } finally {
                setIsLoading(false)
            }
        }

        checkAuth()
    }, [onLogin, spotifyUser])

    const startLogin = async () => {
        if (!hasClientId()) {
            setShowSetup(true)
            return
        }

        try {
            setError(null)
            const clientId = getClientId()!
            const state = generateRandomString(16)
            const codeVerifier = generateRandomString(128)

            sessionStorage.setItem('spotify_auth_state', state)
            sessionStorage.setItem('code_verifier', codeVerifier)

            const codeChallenge = await generateCodeChallenge(codeVerifier)

            const params = new URLSearchParams({
                response_type: 'code',
                client_id: clientId,
                scope: 'user-read-private user-read-email user-library-read playlist-read-private playlist-read-collaborative',
                redirect_uri: 'https://fuckspotify.netlify.app/callback',
                state,
                code_challenge_method: 'S256',
                code_challenge: codeChallenge,
            })

            if (isMobile) {
                localStorage.setItem('spotify_login_started', 'true')
            }

            window.location.href = `https://accounts.spotify.com/authorize?${params}`
        } catch (err) {
            setError('Login failed')
            console.error(err)
        }
    }

    const logout = () => {
        spotifyAuth.logout()
        localStorage.removeItem('spotify_user')
        localStorage.removeItem('spotify_login_started')
        onLogin(null)
        setError(null)
    }

    const handleClick = () => {
        if (isLoading) return
        spotifyUser ? logout() : startLogin()
    }

    return (
        <>
            <div
                className={`relative bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center ${isMobile ? 'h-[200px]' : 'h-full'
                    }`}
                style={{
                    backgroundImage: "url('/Buttons/UI_Background.png')",
                    backgroundSize: '100% 100%'
                }}
            >
                {/* Error display */}
                {error && (
                    <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-xs p-2 text-center">
                        {error}
                        <button onClick={() => setError(null)} className="ml-2">×</button>
                    </div>
                )}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="absolute top-2 right-2 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                )}

                {/* Main button */}
                <img
                    src={spotifyUser ? "/Buttons/Logout.png" : "/Buttons/Login.png"}
                    alt={spotifyUser ? "Logout" : "Login"}
                    onClick={handleClick}
                    className={`${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-[20%]'} transition-opacity ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
                        }`}
                    title={spotifyUser ? `Logged in as ${spotifyUser.name}` : 'Login to Spotify'}
                />

                {/* User status */}
                {spotifyUser && (
                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-green-400 bg-black/50 px-2 py-1 rounded">
                        {spotifyUser.name}
                    </div>
                )}
            </div>

            {/* Setup modal */}
            {showSetup && (
                <SetupModal
                    isMobile={isMobile}
                    onClose={() => setShowSetup(false)}
                    onComplete={() => {
                        setShowSetup(false)
                        startLogin()
                    }}
                />
            )}
        </>
    )
}