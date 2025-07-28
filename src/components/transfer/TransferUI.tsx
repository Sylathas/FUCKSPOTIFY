'use client'

import { useEffect, useState } from 'react'
import SpotifyLoginSection from './SpotifyLoginSection'
import MusicSelectorSection from './MusicSelectorSection'
import PlatformSelectorSection from './PlatformSelectorSection'
import TransferButtonSection from './TransferButtonSection'

export default function TransferUI() {
    const [isMobile, setIsMobile] = useState(false)

    // State that will be shared between components
    const [spotifyUser, setSpotifyUser] = useState<any>(null)
    const [selectedSongs, setSelectedSongs] = useState<string[]>([])
    const [selectedAlbums, setSelectedAlbums] = useState<string[]>([])
    const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([])
    const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener('resize', checkMobile)

        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    return (
        <div className="w-full h-[50vh] flex items-center justify-center">
            <div className="max-w-[95%] w-full h-full">

                {/* Transfer UI Container */}
                <div className={`
          ${isMobile
                        ? 'flex flex-col space-y-6'
                        : 'grid grid-cols-6 h-full'
                    }
        `}>

                    {/* Section 1: Login to Spotify */}
                    <div className={isMobile ? 'w-full' : 'col-span-1'}>
                        <SpotifyLoginSection
                            isMobile={isMobile}
                            onLogin={setSpotifyUser}
                            spotifyUser={spotifyUser}
                        />
                    </div>

                    {/* Section 2-4: Select Songs/Albums/Playlists (3 columns) */}
                    <div className={isMobile ? 'w-full' : 'col-span-3'}>
                        <MusicSelectorSection
                            isMobile={isMobile}
                            spotifyUser={spotifyUser}
                            selectedSongs={selectedSongs}
                            selectedAlbums={selectedAlbums}
                            selectedPlaylists={selectedPlaylists}
                            onSelectSongs={setSelectedSongs}
                            onSelectAlbums={setSelectedAlbums}
                            onSelectPlaylists={setSelectedPlaylists}
                        />
                    </div>

                    {/* Section 5: Choose Platform */}
                    <div className={isMobile ? 'w-full' : 'col-span-1'}>
                        <PlatformSelectorSection
                            isMobile={isMobile}
                            selectedPlatform={selectedPlatform}
                            onSelectPlatform={setSelectedPlatform}
                        />
                    </div>

                    {/* Section 6: Transfer Button */}
                    <div className={isMobile ? 'w-full' : 'col-span-1'}>
                        <TransferButtonSection
                            isMobile={isMobile}
                            spotifyUser={spotifyUser}
                            selectedSongs={selectedSongs}
                            selectedAlbums={selectedAlbums}
                            selectedPlaylists={selectedPlaylists}
                            selectedPlatform={selectedPlatform}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}