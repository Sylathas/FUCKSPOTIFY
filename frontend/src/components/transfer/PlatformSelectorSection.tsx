import { useState, useEffect } from 'react'

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
    const [isCheckingTidalAuth, setIsCheckingTidalAuth] = useState(true)

    const platforms = [
        { name: 'APPLE MUSIC', image: '/Buttons/Apple.png', implemented: false },
        { name: 'SOUNDCLOUD', image: '/Buttons/Soundcloud.png', implemented: false },
        { name: 'TIDAL', image: '/Buttons/Tidal.png', implemented: true },
        { name: 'YOUTUBE MUSIC', image: '/Buttons/YT.png', implemented: false },
        { name: 'BANDCAMP', image: '/Buttons/Bandcamp.png', implemented: true }
    ]

    const handlePlatformClick = async (platformName: string) => {
        if (!platforms.find(p => p.name === platformName)?.implemented) {
            // Platform not implemented yet
            alert(`${platformName} integration coming soon!`)
            return
        }

        onSelectPlatform(platformName)
    }

    return (
        <div
            className={`
        relative bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center p-4
        ${isMobile ? 'h-[300px]' : 'h-[100%]'}
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
                  ${isMobile ? 'max-h-9' : 'max-h-10'}
                `}
                                title={
                                    platform.implemented
                                        ? `Select ${platform.name}`
                                        : `${platform.name} - Coming Soon`
                                }
                            />

                            {/* Coming soon indicator for unimplemented platforms */}
                            {!platform.implemented && (
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

            {/* Status indicator */}
            {isCheckingTidalAuth && (
                <div className="absolute bottom-2 right-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                </div>
            )}
        </div>
    )
}