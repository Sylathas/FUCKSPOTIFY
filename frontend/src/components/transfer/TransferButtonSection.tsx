import { bandcampIntegration } from '@/lib/bandcamp'
import { useState, useEffect } from 'react'
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

interface ProgressData {
    transfer_id: string
    status: string
    current_step: string
    progress_percent: number
    completed_playlists: number
    total_playlists: number
    current_playlist?: string
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
    const [currentTransferId, setCurrentTransferId] = useState<string | null>(null)
    const [detailedProgress, setDetailedProgress] = useState<ProgressData | null>(null)

    const totalSelected = selectedSongs.length + selectedAlbums.length + selectedPlaylists.length

    const canTransfer = () => {
        return spotifyUser && totalSelected > 0 && (selectedPlatform === 'TIDAL' || selectedPlatform === 'BANDCAMP')
    }

    const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000';

    // Progress polling effect for Tidal transfers
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null

        if (currentTransferId && isTransferring && selectedPlatform === 'TIDAL') {
            interval = setInterval(async () => {
                try {
                    const response = await fetch(`${BACKEND_API_URL}/api/transfer/progress/${currentTransferId}`)
                    if (response.ok) {
                        const progress: ProgressData = await response.json()
                        setDetailedProgress(progress)
                        setTransferProgress(progress.progress_percent)

                        if (progress.current_playlist) {
                            setTransferStatus(`${progress.current_step}: ${progress.current_playlist}`)
                        } else {
                            setTransferStatus(progress.current_step)
                        }

                        if (progress.status === 'completed') {
                            setTransferStatus('Transfer completed successfully!')
                            setIsTransferring(false)
                            setCurrentTransferId(null)
                            setTimeout(() => {
                                setTransferStatus('')
                                setTransferProgress(0)
                                setDetailedProgress(null)
                            }, 3000)
                        } else if (progress.status === 'failed') {
                            setTransferStatus(`Transfer failed: ${progress.current_step}`)
                            setIsTransferring(false)
                            setCurrentTransferId(null)
                        }
                    } else if (response.status === 404) {
                        setIsTransferring(false)
                        setCurrentTransferId(null)
                        setTransferStatus('Transfer session expired')
                    }
                } catch (error) {
                    console.error('Error polling progress:', error)
                }
            }, 2000)
        }

        return () => {
            if (interval) clearInterval(interval)
        }
    }, [currentTransferId, isTransferring, selectedPlatform, BACKEND_API_URL])

    // FIXED: Comprehensive data fetching that gets ALL selected items
    const fetchSelectedData = async () => {
        console.log('🔍 Fetching selected data...')
        console.log(`Selected: ${selectedSongs.length} songs, ${selectedAlbums.length} albums, ${selectedPlaylists.length} playlists`)

        const tracksToProcess: SpotifyTrack[] = []
        const albumsToProcess: SpotifyAlbum[] = []
        const playlistsToProcess: SpotifyPlaylist[] = []

        try {
            // 1. Fetch ALL selected tracks (liked songs)
            if (selectedSongs.length > 0) {
                console.log('📀 Fetching ALL user tracks to find selected ones...')
                setTransferStatus(`Loading your ${selectedSongs.length} selected tracks...`)

                let allTracks: SpotifyTrack[] = []
                let offset = 0
                let foundCount = 0

                // Keep fetching until we find all selected tracks or reach the end
                while (foundCount < selectedSongs.length) {
                    const batch = await spotifyAuth.getUserTracks(offset, 50)
                    if (batch.length === 0) break // No more tracks

                    allTracks.push(...batch)

                    // Count how many selected tracks we've found so far
                    foundCount = allTracks.filter(track => selectedSongs.includes(track.id)).length

                    offset += 50

                    // Update progress
                    setTransferStatus(`Loading tracks... found ${foundCount}/${selectedSongs.length}`)
                }

                const selectedTracksData = allTracks.filter(track => selectedSongs.includes(track.id))
                tracksToProcess.push(...selectedTracksData)
                console.log(`✓ Found ${selectedTracksData.length}/${selectedSongs.length} selected tracks`)
            }

            // 2. Fetch ALL selected albums
            if (selectedAlbums.length > 0) {
                console.log('💿 Fetching ALL user albums to find selected ones...')
                setTransferStatus(`Loading your ${selectedAlbums.length} selected albums...`)

                let allAlbums: SpotifyAlbum[] = []
                let offset = 0
                let foundCount = 0

                // Keep fetching until we find all selected albums or reach the end
                while (foundCount < selectedAlbums.length) {
                    const batch = await spotifyAuth.getUserAlbums(offset, 50)
                    if (batch.length === 0) break // No more albums

                    allAlbums.push(...batch)

                    // Count how many selected albums we've found so far
                    foundCount = allAlbums.filter(album => selectedAlbums.includes(album.id)).length

                    offset += 50

                    // Update progress
                    setTransferStatus(`Loading albums... found ${foundCount}/${selectedAlbums.length}`)
                }

                const selectedAlbumsData = allAlbums.filter(album => selectedAlbums.includes(album.id))
                albumsToProcess.push(...selectedAlbumsData)
                console.log(`✓ Found ${selectedAlbumsData.length}/${selectedAlbums.length} selected albums`)
            }

            // 3. Fetch ALL selected playlists WITH their tracks, covers, and descriptions
            if (selectedPlaylists.length > 0) {
                console.log('🎵 Fetching ALL user playlists to find selected ones...')
                setTransferStatus(`Loading your ${selectedPlaylists.length} selected playlists...`)

                let allPlaylists: SpotifyPlaylist[] = []
                let offset = 0
                let foundCount = 0

                // Keep fetching until we find all selected playlists or reach the end
                while (foundCount < selectedPlaylists.length) {
                    const batch = await spotifyAuth.getUserPlaylists(offset, 50)
                    if (batch.length === 0) break // No more playlists

                    allPlaylists.push(...batch)

                    // Count how many selected playlists we've found so far
                    foundCount = allPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id)).length

                    offset += 50

                    // Update progress
                    setTransferStatus(`Loading playlists... found ${foundCount}/${selectedPlaylists.length}`)
                }

                const selectedPlaylistsData = allPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id))

                // Fetch tracks for each selected playlist
                for (let i = 0; i < selectedPlaylistsData.length; i++) {
                    const playlist = selectedPlaylistsData[i]
                    setTransferStatus(`Loading tracks for playlist: ${playlist.name}`)

                    try {
                        const playlistTracks = await spotifyAuth.getPlaylistTracks(playlist.id)

                        // Enhanced playlist object with full metadata
                        const enhancedPlaylist = {
                            ...playlist,
                            tracks: playlistTracks,
                            // Ensure we have cover image and description
                            coverImage: playlist.images?.[0]?.url || playlist.coverImage,
                            description: playlist.description || ''
                        }

                        playlistsToProcess.push(enhancedPlaylist)
                        console.log(`✓ Loaded ${playlistTracks.length} tracks for playlist: ${playlist.name}`)
                    } catch (error) {
                        console.error(`Failed to load tracks for playlist ${playlist.name}:`, error)
                        // Add playlist even without tracks to avoid losing it
                        playlistsToProcess.push({
                            ...playlist,
                            tracks: [],
                            coverImage: playlist.images?.[0]?.url || playlist.coverImage,
                            description: playlist.description || ''
                        })
                    }
                }

                console.log(`✓ Processed ${playlistsToProcess.length}/${selectedPlaylists.length} selected playlists`)
            }

            console.log('📊 Final counts:')
            console.log(`- Tracks: ${tracksToProcess.length}`)
            console.log(`- Albums: ${albumsToProcess.length}`)
            console.log(`- Playlists: ${playlistsToProcess.length}`)

            return { tracksToProcess, albumsToProcess, playlistsToProcess }

        } catch (error) {
            console.error('Error fetching selected data:', error)
            throw error
        }
    }

    const handleTransfer = async () => {
        if (!canTransfer()) return

        setIsTransferring(true)
        setTransferStatus('Preparing transfer...')
        setTransferProgress(0)

        try {
            // Fetch ALL selected data comprehensively
            const { tracksToProcess, albumsToProcess, playlistsToProcess } = await fetchSelectedData()

            const tidalToken = localStorage.getItem('tidal_access_token');
            if (selectedPlatform === 'TIDAL' && !tidalToken) {
                alert('Please log in to Tidal first!');
                setIsTransferring(false);
                return;
            }

            if (selectedPlatform === 'TIDAL') {
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tidalToken}`
                };

                const results = [];
                let completedOperations = 0;
                const totalOperations = (playlistsToProcess.length > 0 ? 1 : 0) +
                    (tracksToProcess.length > 0 ? 1 : 0) +
                    (albumsToProcess.length > 0 ? 1 : 0);

                // Handle playlists with progress tracking (includes covers & descriptions)
                if (playlistsToProcess.length > 0) {
                    setTransferStatus('Sending playlists to server...');
                    const res = await fetch(`${BACKEND_API_URL}/api/transfer/playlists`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ playlists: playlistsToProcess })
                    });

                    const playlistResult = await res.json();
                    if (playlistResult.transfer_id) {
                        setCurrentTransferId(playlistResult.transfer_id);
                        // Progress will be handled by the polling effect
                    } else {
                        results.push(`Playlists: ${playlistResult.message}`);
                        completedOperations++;
                        setTransferProgress(Math.round((completedOperations / totalOperations) * 100));
                    }
                }

                // Handle liked songs
                if (tracksToProcess.length > 0) {
                    setTransferStatus(`Processing ${tracksToProcess.length} liked songs...`);
                    const res = await fetch(`${BACKEND_API_URL}/api/like/songs`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ tracks: tracksToProcess })
                    });
                    const songResult = await res.json();
                    results.push(`Liked Songs: ${songResult.message}`);
                    if (songResult.failed && songResult.failed.length > 0) {
                        console.log('Failed tracks:', songResult.failed);
                    }
                    completedOperations++;
                    setTransferProgress(Math.round((completedOperations / totalOperations) * 100));
                }

                // Handle albums (add to favorites, not individual tracks)
                if (albumsToProcess.length > 0) {
                    setTransferStatus(`Processing ${albumsToProcess.length} albums...`);
                    const res = await fetch(`${BACKEND_API_URL}/api/add/albums`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ albums: albumsToProcess })
                    });
                    const albumResult = await res.json();
                    results.push(`Albums: ${albumResult.message}`);
                    if (albumResult.failed && albumResult.failed.length > 0) {
                        console.log('Failed albums:', albumResult.failed);
                    }
                    completedOperations++;
                    setTransferProgress(Math.round((completedOperations / totalOperations) * 100));
                }

                // If no playlists (so no background transfer), show completion
                if (playlistsToProcess.length === 0) {
                    alert("Transfer completed!\n\n" + results.join("\n"));
                    setTransferStatus('Transfer completed!');
                    setTimeout(() => {
                        setIsTransferring(false);
                        setTransferStatus('');
                        setTransferProgress(0);
                    }, 2000);
                }

            } else if (selectedPlatform === 'BANDCAMP') {
                // Bandcamp logic remains the same
                const result = await bandcampIntegration.transferToBandcamp(
                    tracksToProcess,
                    albumsToProcess,
                    playlistsToProcess,
                    (progress, status) => {
                        setTransferProgress(progress)
                        setTransferStatus(status)
                    }
                )
                const downloadChoice = confirm(`Bandcamp Guide Ready!\n\nClick OK to download .txt, or Cancel to print/save as PDF.`);
                if (downloadChoice) {
                    result.downloadOptions.downloadTxt();
                } else {
                    result.downloadOptions.downloadPdf();
                }
                setIsTransferring(false);
            }
        } catch (error) {
            console.error('Transfer failed:', error)
            alert(`Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
            setTransferStatus('Transfer failed');
            setIsTransferring(false);
            setCurrentTransferId(null);
        }
    }

    const transferReady = canTransfer()

    return (
        <div
            className={`
                relative bg-cover bg-center bg-no-repeat
                flex items-center justify-center
                ${isMobile ? 'h-[300px]' : 'h-[100%]'}
            `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')",
                backgroundSize: '100% 100%'
            }}
        >
            {/* Progress overlay during transfer */}
            {isTransferring && (
                <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-10 rounded">
                    {/* Progress bar */}
                    <div className="w-3/4 bg-gray-700 rounded-full h-3 mb-3">
                        {transferProgress > 0 && (
                            <div
                                className="bg-green-400 h-3 rounded-full transition-all duration-300"
                                style={{ width: `${transferProgress}%` }}
                            />
                        )}
                    </div>

                    {/* Status text */}
                    <p className="text-green-400 text-sm text-center font-mono px-2 mb-2">
                        {transferStatus}
                    </p>

                    {/* Detailed progress for playlists */}
                    {detailedProgress && detailedProgress.total_playlists > 0 && (
                        <p className="text-yellow-400 text-xs text-center font-mono px-2">
                            Playlist {detailedProgress.completed_playlists + 1} of {detailedProgress.total_playlists}
                        </p>
                    )}
                </div>
            )}

            {/* Transfer Button Image */}
            <img
                src={transferReady ? "/Buttons/Transfer.png" : "/Buttons/Transfer_Disabled.png"}
                alt="Transfer"
                onClick={handleTransfer}
                className={`
                    ${isMobile ? 'w-[80%] h-[200px]' : 'w-[90%] h-auto'}
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
                <div className="absolute bottom-8 left-0 right-0 text-center">
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