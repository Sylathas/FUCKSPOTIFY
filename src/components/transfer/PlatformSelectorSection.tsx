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

    const platforms = [
        { name: 'APPLE MUSIC', image: '/Buttons/Apple.png' },
        { name: 'SOUNDCLOUD', image: '/Buttons/Soundcloud.png' },
        { name: 'TIDAL', image: '/Buttons/Tidal.png' },
        { name: 'YOUTUBE MUSIC', image: '/Buttons/Yt.png' },
        { name: 'BANDCAMP', image: '/Buttons/Bandcamp.png' }
    ]

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
                {platforms.map((platform) => (
                    <img
                        key={platform.name}
                        src={platform.image}
                        alt={platform.name}
                        onClick={() => onSelectPlatform(platform.name)}
                        className={`
              w-full h-auto cursor-pointer transition-all
              ${selectedPlatform === platform.name
                                ? 'brightness-125 scale-105'
                                : 'hover:brightness-110 hover:scale-102'
                            }
              ${isMobile ? 'max-h-4' : 'max-h-10'}
            `}
                    />
                ))}
            </div>
        </div>
    )
}