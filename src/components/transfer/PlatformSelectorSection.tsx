import { useState, useEffect } from 'react'
import { tidalIntegration } from '@/lib/tidal'

interface PlatformSelectorSectionProps {
    isMobile: boolean
    selectedPlatform: string | null
    onSelectPlatform: (platform: string) => void
}

export default function PlatformSelectorSection({
    isMobile,
    selectedPlatform,
    onSelectPlatform
}: PlatformSelectorSectionProps) {
    const [tidalUser, setTidalUser] = useState<any>(null)
    const [isCheckingTidalAuth, setIsCheckingTidalAuth] = useState(true)

    const platforms = [
        { name: 'APPLE MUSIC', image: '/Buttons/Apple.png', implemented: false },
        { name: 'SOUNDCLOUD', image: '/Buttons/Soundcloud.png', implemented: false },
        { name: 'TIDAL', image: '/Buttons/Tidal.png', implemented: true },
        { name: 'YOUTUBE MUSIC', image: '/Buttons/YT.png', implemented: false },
        { name: 'BANDCAMP', image: '/Buttons/Bandcamp.png', implemented: true }
    ]

    useEffect(() => {
        // Check if user is already logged into Tidal
        const checkTidalAuth = () => {
            if (tidalIntegration.isAuthenticated()) {
                const user = tidalIntegration.getCurrentUser()
                setTidalUser(user)
            }
            setIsCheckingTidalAuth(false)
        }

        checkTidalAuth()
    }, [])

    const handlePlatformClick = async (platformName: string) => {
        if (platformName === 'TIDAL') {
            if (!tidalUser) {
                // User needs to log in to Tidal first
                try {
                    await tidalIntegration.redirectToTidalLogin()
                } catch (error) {
                    console.error('Error initiating Tidal login:', error)
                    alert('Failed to start Tidal login. Please check your configuration.')
                }
                return
            }
        } else if (!platforms.find(p => p.name === platformName)?.implemented) {
            // Platform not implemented yet
            alert(`${platformName} integration coming soon!`)
            return
        }

        onSelectPlatform(platformName)
    }

    const handleTidalLogout = () => {
        tidalIntegration.logout()
        setTidalUser(null)
        if (selectedPlatform === 'TIDAL') {
            onSelectPlatform("")
        }
    }

    return (
        <div
            className={`
        relative bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center p-4
        ${isMobile ? 'h-[150px]' : 'h-[100%]'}
      `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')",
                backgroundSize: '100% 100%'
            }}
        >
            {/* Platform buttons */}
            <div className="flex-1 flex flex-col justify-center space-y-2 w-full">
                {platforms.map((platform) => {
                    const isSelected = selectedPlatform === platform.name
                    const isTidal = platform.name === 'TIDAL'
                    const isLoggedIntoTidal = isTidal && tidalUser

                    return (
                        <div key={platform.name} className="relative">
                            <img
                                src={platform.image}
                                alt={platform.name}
                                onClick={() => handlePlatformClick(platform.name)}
                                className={`
                  w-full h-auto cursor-pointer transition-all
                  ${isSelected
                                        ? 'brightness-125 scale-105'
                                        : platform.implemented
                                            ? 'hover:brightness-110 hover:scale-102'
                                            : 'opacity-50 cursor-not-allowed'
                                    }
                  ${isMobile ? 'max-h-4' : 'max-h-10'}
                `}
                                title={
                                    isTidal
                                        ? isLoggedIntoTidal
                                            ? `Logged in as ${tidalUser.username || tidalUser.firstName || 'User'}`
                                            : 'Click to log in to Tidal'
                                        : platform.implemented
                                            ? `Select ${platform.name}`
                                            : `${platform.name} - Coming Soon`
                                }
                            />

                            {/* Tidal user indicator */}
                            {isTidal && isLoggedIntoTidal && (
                                <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border border-white"
                                    title={`Logged in as ${tidalUser.username || tidalUser.firstName || 'User'}`} />
                            )}

                            {/* Coming soon indicator for unimplemented platforms */}
                            {!platform.implemented && !isTidal && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs text-white bg-black bg-opacity-75 px-1 rounded">
                                        Soon
                                    </span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Tidal logout button (only shown when logged in) */}
            {tidalUser && (
                <div className="mt-2 w-full">
                    <button
                        onClick={handleTidalLogout}
                        className="w-full text-xs text-red-400 hover:text-red-300 transition-colors bg-black bg-opacity-50 py-1 rounded"
                        title="Logout from Tidal"
                    >
                        Logout Tidal
                    </button>
                </div>
            )}

            {/* Status indicator */}
            {isCheckingTidalAuth && (
                <div className="absolute bottom-2 right-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                </div>
            )}
        </div>
    )
}