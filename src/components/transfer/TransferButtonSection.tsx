import { useState } from 'react'
import { tidalIntegration } from '@/lib/tidal'
import { bandcampIntegration } from '@/lib/bandcamp'
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

export default function TransferButtonSection({
    isMobile,
    spotifyUser,
    selectedSongs,
    selectedAlbums,
    selectedPlaylists,
    selectedPlatform
}: TransferButtonSectionProps) {
    const [isTransferring, setIsTransferring] = useState(false)
    const [transferStatus, setTransferStatus] = useState('')
    const [transferProgress, setTransferProgress] = useState(0)

    const totalSelected = selectedSongs.length + selectedAlbums.length + selectedPlaylists.length

    // Simple check: can we transfer?
    const canTransfer = () => {
        return spotifyUser && totalSelected > 0 && (selectedPlatform === 'TIDAL' || selectedPlatform === 'BANDCAMP')
    }

    // Fetch Spotify data for selected items
    const fetchSelectedData = async () => {
        const tracks: SpotifyTrack[] = []
        const albums: SpotifyAlbum[] = []
        const playlists: SpotifyPlaylist[] = []

        if (selectedSongs.length > 0) {
            const userTracks = await spotifyAuth.getUserTracks(0, 1000)
            tracks.push(...userTracks.filter(track => selectedSongs.includes(track.id)))
        }

        if (selectedAlbums.length > 0) {
            const userAlbums = await spotifyAuth.getUserAlbums(0, 1000)
            albums.push(...userAlbums.filter(album => selectedAlbums.includes(album.id)))
        }

        if (selectedPlaylists.length > 0) {
            const userPlaylists = await spotifyAuth.getUserPlaylists(0, 1000)
            const selectedPlaylistObjects = userPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id))

            for (const playlist of selectedPlaylistObjects) {
                const playlistTracks = await spotifyAuth.getPlaylistTracks(playlist.id)
                playlist.tracks = playlistTracks
            }

            playlists.push(...selectedPlaylistObjects)
        }

        return { tracks, albums, playlists }
    }

    const handleTransfer = async () => {
        if (!canTransfer()) return

        setIsTransferring(true)
        setTransferProgress(0)
        setTransferStatus('Starting transfer...')

        try {
            // Fetch selected data
            const { tracks, albums, playlists } = await fetchSelectedData()

            if (selectedPlatform === 'TIDAL') {
                // Tidal transfer
                const result = await tidalIntegration.transferToTidal(
                    tracks,
                    albums,
                    playlists,
                    (progress, status) => {
                        setTransferProgress(progress)
                        setTransferStatus(status)
                    }
                )

                // Show final result
                const successCount = [
                    ...result.results.tracks.filter(t => t.tidalUrl),
                    ...result.results.albums.filter(a => a.tidalUrl),
                    ...result.results.playlists.filter(p => p.tidalUrl)
                ].length

                alert(`Transfer Complete!\n${successCount}/${totalSelected} items successfully transferred to Tidal.`)

            } else if (selectedPlatform === 'BANDCAMP') {
                // Bandcamp guide generation
                const result = await bandcampIntegration.transferToBandcamp(
                    tracks,
                    albums,
                    playlists,
                    (progress, status) => {
                        setTransferProgress(progress)
                        setTransferStatus(status)
                    }
                )

                // Show download options
                const downloadChoice = confirm(
                    `Bandcamp Guide Ready!\n\n${result.stats.totalArtists} unique artists found from your ${totalSelected} selected items.\n\nClick OK to download TXT guide, or Cancel to print/save as PDF.`
                )

                if (downloadChoice) {
                    result.downloadOptions.downloadTxt()
                } else {
                    result.downloadOptions.downloadPdf()
                }
            }

        } catch (error) {
            console.error('Transfer failed:', error)
            alert(`Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setIsTransferring(false)
            setTransferStatus('')
            setTransferProgress(0)
        }
    }

    const transferReady = canTransfer()

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
            {/* Progress overlay during transfer */}
            {isTransferring && (
                <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-10 rounded">
                    <div className="w-3/4 bg-gray-700 rounded-full h-3 mb-3">
                        <div
                            className="bg-green-500 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${transferProgress}%` }}
                        />
                    </div>
                    <p className="text-green-400 text-sm text-center font-mono px-2">
                        {transferStatus}
                    </p>
                    <p className="text-white text-sm mt-1 font-bold">
                        {transferProgress}%
                    </p>
                </div>
            )}

            {/* Transfer Button Image */}
            <img
                src={transferReady ? "/Buttons/Transfer.png" : "/Buttons/Transfer_Disabled.png"}
                alt="Transfer"
                onClick={handleTransfer}
                className={`
          ${isMobile ? 'w-[80%] h-auto' : 'w-[90%] h-auto'}
          ${transferReady && !isTransferring
                        ? 'cursor-pointer hover:opacity-80 hover:scale-105 transition-all'
                        : 'cursor-not-allowed'
                    }
        `}
                title={
                    transferReady
                        ? `Transfer ${totalSelected} items to ${selectedPlatform}`
                        : !spotifyUser
                            ? "Log in to Spotify first"
                            : totalSelected === 0
                                ? "Select music to transfer"
                                : "Select Tidal or Bandcamp"
                }
            />

            {/* Status text */}
            {!isTransferring && (
                <div className="absolute bottom-2 left-0 right-0 text-center">
                    <p className={`text-xs font-mono ${transferReady ? 'text-green-400' : 'text-yellow-400'}`}>
                        {transferReady
                            ? `Ready: ${totalSelected} items → ${selectedPlatform}`
                            : !spotifyUser
                                ? "Log in to Spotify first"
                                : totalSelected === 0
                                    ? "Select music to transfer"
                                    : "Select Tidal or Bandcamp"
                        }
                    </p>
                </div>
            )}
        </div>
    )
}