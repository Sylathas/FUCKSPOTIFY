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

                        // Check if transfer is complete
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
                        // Transfer not found or expired
                        setIsTransferring(false)
                        setCurrentTransferId(null)
                        setTransferStatus('Transfer session expired')
                    }
                } catch (error) {
                    console.error('Error polling progress:', error)
                }
            }, 2000) // Poll every 2 seconds
        }

        return () => {
            if (interval) clearInterval(interval)
        }
    }, [currentTransferId, isTransferring, selectedPlatform, BACKEND_API_URL])

    const fetchSelectedData = async () => {
        const playlists: SpotifyPlaylist[] = []

        // Fetch full playlist objects and their tracks
        if (selectedPlaylists.length > 0) {
            const userPlaylists = await spotifyAuth.getUserPlaylists(0, 1000)
            const selectedPlaylistObjects = userPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id))

            for (const playlist of selectedPlaylistObjects) {
                const playlistTracks = await spotifyAuth.getPlaylistTracks(playlist.id)
                playlists.push({ ...playlist, tracks: playlistTracks });
            }
        }
        return { playlists }
    }

    const handleTransfer = async () => {
        if (!canTransfer()) return

        setIsTransferring(true)
        setTransferStatus('Gathering your selected music...')
        setTransferProgress(0)

        try {
            // First, fetch all the detailed data for selected items
            const allUserTracks = await spotifyAuth.getUserTracks(0, 1000);
            const allUserAlbums = await spotifyAuth.getUserAlbums(0, 1000);
            const allUserPlaylists = await spotifyAuth.getUserPlaylists(0, 1000);

            const tracksToProcess = allUserTracks.filter(t => selectedSongs.includes(t.id));
            const albumsToProcess = allUserAlbums.filter(a => selectedAlbums.includes(a.id));
            const playlistsToProcess = allUserPlaylists.filter(p => selectedPlaylists.includes(p.id));

            // Fetch tracks for playlists
            for (const playlist of playlistsToProcess) {
                const playlistTracks = await spotifyAuth.getPlaylistTracks(playlist.id);
                playlist.tracks = playlistTracks;
            }

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

                // Handle playlists with progress tracking
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
                    setTransferStatus('Processing liked songs...');
                    const res = await fetch(`${BACKEND_API_URL}/api/like/songs`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ tracks: tracksToProcess })
                    });
                    const songResult = await res.json();
                    results.push(`Liked Songs: ${songResult.message}`);
                    completedOperations++;
                    setTransferProgress(Math.round((completedOperations / totalOperations) * 100));
                }

                // Handle albums
                if (albumsToProcess.length > 0) {
                    setTransferStatus('Processing albums...');
                    const res = await fetch(`${BACKEND_API_URL}/api/add/albums`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ albums: albumsToProcess })
                    });
                    const albumResult = await res.json();
                    results.push(`Albums: ${albumResult.message}`);
                    completedOperations++;
                    setTransferProgress(Math.round((completedOperations / totalOperations) * 100));
                }

                // If no playlists (so no background transfer), show completion
                if (playlistsToProcess.length === 0) {
                    alert("Transfer completed!\n\n" + results.join("\n"));
                    setTransferStatus('Done!');
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