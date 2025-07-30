import { bandcampIntegration } from '@/lib/bandcamp'
import { useState } from 'react'
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

    const canTransfer = () => {
        return spotifyUser && totalSelected > 0 && (selectedPlatform === 'TIDAL' || selectedPlatform === 'BANDCAMP')
    }

    const fetchSelectedData = async () => {
        const playlists: SpotifyPlaylist[] = []

        // Fetch full playlist objects and their tracks
        if (selectedPlaylists.length > 0) {
            const userPlaylists = await spotifyAuth.getUserPlaylists(0, 1000) // You might want to paginate this
            const selectedPlaylistObjects = userPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id))

            for (const playlist of selectedPlaylistObjects) {
                const playlistTracks = await spotifyAuth.getPlaylistTracks(playlist.id)
                // Add tracks to the playlist object
                playlists.push({ ...playlist, tracks: playlistTracks });
            }
        }
        return { playlists }
    }

    const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000';

    const handleTransfer = async () => {
        if (!canTransfer()) return

        setIsTransferring(true)
        setTransferStatus('Gathering your selected music...');

        // First, fetch all the detailed data for selected items
        const allUserTracks = await spotifyAuth.getUserTracks(0, 1000);
        const allUserAlbums = await spotifyAuth.getUserAlbums(0, 1000);
        const allUserPlaylists = await spotifyAuth.getUserPlaylists(0, 1000);

        const tracksToProcess = allUserTracks.filter(t => selectedSongs.includes(t.id));
        const albumsToProcess = allUserAlbums.filter(a => selectedAlbums.includes(a.id));
        const playlistsToProcess = allUserPlaylists.filter(p => selectedPlaylists.includes(p.id));

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

        try {
            if (selectedPlatform === 'TIDAL') {
                // For each fetch call to your backend, add the Authorization header
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tidalToken}`
                };

                const results = [];
                // --- TIDAL LOGIC (CALLING THE BACKEND) ---
                if (playlistsToProcess.length > 0) {
                    setTransferStatus('Sending playlists to server...');
                    const res = await fetch(`${BACKEND_API_URL}/api/transfer/playlists`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ playlists: playlistsToProcess })
                    });
                    results.push(`Playlists: ${(await res.json()).message}`);
                }
                if (tracksToProcess.length > 0) {
                    setTransferStatus('Sending liked songs to server...');
                    const res = await fetch(`${BACKEND_API_URL}/api/like/songs`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ tracks: tracksToProcess })
                    });
                    results.push(`Liked Songs: ${(await res.json()).message}`);
                }
                if (albumsToProcess.length > 0) {
                    setTransferStatus('Sending albums to server...');
                    const res = await fetch(`${BACKEND_API_URL}/api/add/albums`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ albums: albumsToProcess })
                    });
                    results.push(`Albums: ${(await res.json()).message}`);
                }
                alert("Transfer tasks sent to server!\n\n" + results.join("\n"));
                setTransferStatus('Done!');

            } else if (selectedPlatform === 'BANDCAMP') {
                // --- BANDCAMP LOGIC (ALL CLIENT-SIDE) ---
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
            }
        } catch (error) {
            console.error('Transfer failed:', error)
            alert(`Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
            setTransferStatus('');
        } finally {
            setTimeout(() => setIsTransferring(false), 5000);
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
                    <div className="w-3/4 bg-gray-700 rounded-full h-3 mb-3">
                    </div>
                    <p className="text-green-400 text-sm text-center font-mono px-2">
                        {transferStatus}
                    </p>
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