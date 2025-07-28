import { useState } from 'react'
import { tidalIntegration } from '@/lib/tidal'
import { spotifyAuth } from '@/lib/spotify'
import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

interface TransferButtonSectionProps {
    isMobile: boolean
    spotifyUser: any
    selectedSongs: string[]
    selectedAlbums: string[]
    selectedPlaylists: string[]
    selectedPlatform: string | null
}

interface TransferProgress {
    isTransferring: boolean
    progress: number
    status: string
    results?: any
    errors?: string[]
}

export default function TransferButtonSection({
    isMobile,
    spotifyUser,
    selectedSongs,
    selectedAlbums,
    selectedPlaylists,
    selectedPlatform
}: TransferButtonSectionProps) {
    const [transferProgress, setTransferProgress] = useState<TransferProgress>({
        isTransferring: false,
        progress: 0,
        status: ''
    })

    const totalSelected = selectedSongs.length + selectedAlbums.length + selectedPlaylists.length

    // Enhanced transfer ready check
    const canTransfer = () => {
        const hasSpotifyUser = !!spotifyUser
        const hasSelectedItems = totalSelected > 0
        const hasPlatform = !!selectedPlatform

        // For Tidal, also check authentication
        if (selectedPlatform === 'TIDAL') {
            return hasSpotifyUser && hasSelectedItems && hasPlatform && tidalIntegration.isAuthenticated()
        }

        // For other platforms (when implemented)
        return hasSpotifyUser && hasSelectedItems && hasPlatform
    }

    // Get the reason why transfer is not ready
    const getTransferBlockReason = () => {
        if (!spotifyUser) return "Log in to Spotify first"
        if (totalSelected === 0) return "Select music to transfer"
        if (!selectedPlatform) return "Choose a platform"
        if (selectedPlatform === 'TIDAL' && !tidalIntegration.isAuthenticated()) {
            return "Log in to Tidal first"
        }
        if (selectedPlatform && selectedPlatform !== 'TIDAL') {
            return `${selectedPlatform} integration coming soon!`
        }
        return ""
    }

    // Fetch full data for selected items
    const fetchSelectedData = async () => {
        const tracks: SpotifyTrack[] = []
        const albums: SpotifyAlbum[] = []
        const playlists: SpotifyPlaylist[] = []

        // Get selected tracks
        if (selectedSongs.length > 0) {
            setTransferProgress(prev => ({ ...prev, status: 'Loading selected tracks...' }))
            const userTracks = await spotifyAuth.getUserTracks(0, 1000)
            const selectedTrackObjects = userTracks.filter(track => selectedSongs.includes(track.id))
            tracks.push(...selectedTrackObjects)
        }

        // Get selected albums
        if (selectedAlbums.length > 0) {
            setTransferProgress(prev => ({ ...prev, status: 'Loading selected albums...' }))
            const userAlbums = await spotifyAuth.getUserAlbums(0, 1000)
            const selectedAlbumObjects = userAlbums.filter(album => selectedAlbums.includes(album.id))
            albums.push(...selectedAlbumObjects)
        }

        // Get selected playlists with their tracks
        if (selectedPlaylists.length > 0) {
            setTransferProgress(prev => ({ ...prev, status: 'Loading selected playlists...' }))
            const userPlaylists = await spotifyAuth.getUserPlaylists(0, 1000)
            const selectedPlaylistObjects = userPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id))

            // Fetch tracks for each playlist
            for (const playlist of selectedPlaylistObjects) {
                setTransferProgress(prev => ({ ...prev, status: `Loading tracks for playlist: ${playlist.name}` }))
                const playlistTracks = await spotifyAuth.getPlaylistTracks(playlist.id)
                playlist.tracks = playlistTracks
            }

            playlists.push(...selectedPlaylistObjects)
        }

        return { tracks, albums, playlists }
    }

    const handleTransfer = async () => {
        const transferReady = canTransfer()
        if (!transferReady) {
            // Show the reason why transfer is blocked
            alert(getTransferBlockReason())
            return
        }

        // If platform is not TIDAL, show coming soon message
        if (selectedPlatform !== 'TIDAL') {
            alert(`Starting transfer of ${totalSelected} items to ${selectedPlatform} - Coming Soon!`)
            return
        }

        setTransferProgress({
            isTransferring: true,
            progress: 0,
            status: 'Preparing transfer...'
        })

        try {
            // Fetch all selected data
            const { tracks, albums, playlists } = await fetchSelectedData()

            // Perform Tidal transfer
            const result = await tidalIntegration.transferToTidal(
                tracks,
                albums,
                playlists,
                (progress, status) => {
                    setTransferProgress(prev => ({
                        ...prev,
                        progress,
                        status
                    }))
                }
            )

            setTransferProgress(prev => ({
                ...prev,
                isTransferring: false,
                results: result.results,
                errors: result.errors
            }))

        } catch (error) {
            console.error('Transfer failed:', error)
            setTransferProgress({
                isTransferring: false,
                progress: 0,
                status: 'Transfer failed',
                errors: [error instanceof Error ? error.message : 'Unknown error occurred']
            })
        }
    }

    // Reset transfer state
    const resetTransfer = () => {
        setTransferProgress({
            isTransferring: false,
            progress: 0,
            status: ''
        })
    }

    const transferReady = canTransfer()
    const blockReason = getTransferBlockReason()

    return (
        <div
            className={`
        relative bg-cover bg-center bg-no-repeat
        flex items-center justify-center
        ${isMobile ? 'h-[150px]' : 'h-[100%]'}
      `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')",
                backgroundSize: '100% 100%'
            }}
        >
            {/* Transfer Progress Overlay */}
            {transferProgress.isTransferring && (
                <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-10 rounded">
                    <div className="w-3/4 bg-gray-700 rounded-full h-2 mb-2">
                        <div
                            className="bg-green-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${transferProgress.progress}%` }}
                        />
                    </div>
                    <p className="text-green-400 text-xs text-center font-mono px-2">
                        {transferProgress.status}
                    </p>
                    <p className="text-white text-xs mt-1">
                        {transferProgress.progress}%
                    </p>
                </div>
            )}

            {/* Results Display */}
            {transferProgress.results && !transferProgress.isTransferring && (
                <div className="absolute inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-10 rounded p-2 overflow-auto">
                    <h3 className="text-green-400 text-sm font-bold mb-2">Transfer Complete!</h3>

                    <div className="text-xs text-white space-y-1 max-h-32 overflow-auto w-full text-center">
                        {transferProgress.results.tracks?.length > 0 && (
                            <div>
                                <p className="text-green-300">
                                    Tracks: {transferProgress.results.tracks.filter((t: any) => t.tidalUrl).length}/{transferProgress.results.tracks.length} found
                                </p>
                            </div>
                        )}
                        {transferProgress.results.albums?.length > 0 && (
                            <div>
                                <p className="text-green-300">
                                    Albums: {transferProgress.results.albums.filter((a: any) => a.tidalUrl).length}/{transferProgress.results.albums.length} found
                                </p>
                            </div>
                        )}
                        {transferProgress.results.playlists?.length > 0 && (
                            <div>
                                <p className="text-green-300">
                                    Playlists: {transferProgress.results.playlists.filter((p: any) => p.tidalUrl).length}/{transferProgress.results.playlists.length} created
                                </p>
                            </div>
                        )}
                    </div>

                    {transferProgress.errors && transferProgress.errors.length > 0 && (
                        <div className="mt-2 max-h-20 overflow-auto w-full">
                            <p className="text-red-400 text-xs text-center">Some items couldn't be transferred:</p>
                            <div className="text-red-300 text-xs text-center">
                                {transferProgress.errors.slice(0, 2).map((error, i) => (
                                    <p key={i} className="truncate">• {error}</p>
                                ))}
                                {transferProgress.errors.length > 2 && (
                                    <p>... and {transferProgress.errors.length - 2} more</p>
                                )}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={resetTransfer}
                        className="mt-2 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            )}

            {/* Error Display */}
            {transferProgress.errors && !transferProgress.results && !transferProgress.isTransferring && (
                <div className="absolute inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-10 rounded p-2">
                    <h3 className="text-red-400 text-sm font-bold mb-2">Transfer Failed</h3>
                    <div className="text-red-300 text-xs text-center space-y-1 max-h-20 overflow-auto">
                        {transferProgress.errors.map((error, i) => (
                            <p key={i} className="truncate">• {error}</p>
                        ))}
                    </div>
                    <button
                        onClick={resetTransfer}
                        className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            )}

            {/* Transfer Button Image - Your Original Style */}
            <img
                src={transferReady ? "/Buttons/Transfer.png" : "/Buttons/Transfer_Disabled.png"}
                alt="Transfer"
                onClick={handleTransfer}
                className={`
          ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-auto'}
          ${transferReady
                        ? 'cursor-pointer hover:opacity-80 hover:scale-105 transition-all'
                        : 'cursor-not-allowed'
                    }
        `}
                title={transferReady ? `Transfer ${totalSelected} items to ${selectedPlatform}` : blockReason}
            />

            {/* Optional: Status indicator text below button */}
            {!transferProgress.isTransferring && !transferProgress.results && !transferProgress.errors && (
                <div className="absolute bottom-2 left-0 right-0 text-center">
                    <p className={`text-xs font-mono ${transferReady ? 'text-green-400' : 'text-yellow-400'}`}>
                        {transferReady ? `Ready: ${totalSelected} items → ${selectedPlatform}` : blockReason}
                    </p>
                </div>
            )}
        </div>
    )
}