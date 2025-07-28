import { useEffect, useState } from 'react'
import { spotifyAuth } from '@/lib/spotify'
import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

interface MusicSelectorSectionProps {
    isMobile: boolean
    spotifyUser: any
    selectedSongs: string[]
    selectedAlbums: string[]
    selectedPlaylists: string[]
    onSelectSongs: (songs: string[]) => void
    onSelectAlbums: (albums: string[]) => void
    onSelectPlaylists: (playlists: string[]) => void
}

export default function MusicSelectorSection({
    isMobile,
    spotifyUser,
    selectedSongs,
    selectedAlbums,
    selectedPlaylists,
    onSelectSongs,
    onSelectAlbums,
    onSelectPlaylists
}: MusicSelectorSectionProps) {

    const [tracks, setTracks] = useState<SpotifyTrack[]>([])
    const [albums, setAlbums] = useState<SpotifyAlbum[]>([])
    const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load user's Spotify data when they log in
    useEffect(() => {
        if (spotifyUser) {
            loadSpotifyData()
        } else {
            // Clear data when user logs out
            setTracks([])
            setAlbums([])
            setPlaylists([])
        }
    }, [spotifyUser])

    const loadSpotifyData = async () => {
        setLoading(true)
        setError(null)

        try {
            // Load all data in parallel
            const [userTracks, userAlbums, userPlaylists] = await Promise.all([
                spotifyAuth.getUserTracks(),
                spotifyAuth.getUserAlbums(),
                spotifyAuth.getUserPlaylists()
            ])

            setTracks(userTracks)
            setAlbums(userAlbums)
            setPlaylists(userPlaylists)
        } catch (error) {
            console.error('Error loading Spotify data:', error)
            setError('Failed to load your Spotify library')
        } finally {
            setLoading(false)
        }
    }

    const handleSelectAllSongs = () => {
        onSelectSongs(tracks.map(track => track.id))
    }

    const handleSelectAllAlbums = () => {
        onSelectAlbums(albums.map(album => album.id))
    }

    const handleSelectAllPlaylists = () => {
        onSelectPlaylists(playlists.map(playlist => playlist.id))
    }

    const handleTrackClick = (trackId: string) => {
        if (selectedSongs.includes(trackId)) {
            onSelectSongs(selectedSongs.filter(id => id !== trackId))
        } else {
            onSelectSongs([...selectedSongs, trackId])
        }
    }

    const handleAlbumClick = (albumId: string) => {
        if (selectedAlbums.includes(albumId)) {
            onSelectAlbums(selectedAlbums.filter(id => id !== albumId))
        } else {
            onSelectAlbums([...selectedAlbums, albumId])
        }
    }

    const handlePlaylistClick = (playlistId: string) => {
        if (selectedPlaylists.includes(playlistId)) {
            onSelectPlaylists(selectedPlaylists.filter(id => id !== playlistId))
        } else {
            onSelectPlaylists([...selectedPlaylists, playlistId])
        }
    }

    return (
        <div className={`
      grid h-full
      ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}
    `}>

            {/* Songs Column */}
            <div className="flex flex-col">
                {/* Background with extruded list */}
                <div
                    className={`
            relative bg-cover bg-center bg-no-repeat flex-1 flex flex-col
            ${isMobile ? 'h-[200px]' : 'h-[100%]'}
          `}
                    style={{
                        backgroundImage: "url('/Buttons/UI_Background_Choose.png')",
                        backgroundSize: '100% 100%'
                    }}
                >
                    {/* Title at top */}
                    <div className="pt-12 pb-3 px-3">
                        <img
                            src="/SONGS.png" // Your "SONGS" title image
                            alt="Songs"
                            className="w-full h-auto"
                        />
                    </div>

                    {/* Extruded list area */}
                    <div className="flex-1 mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto"
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}>
                        <div className="p-2 text-green-400 text-xs font-mono">
                            {!spotifyUser ? (
                                <div className="text-gray-500">Login to Spotify first</div>
                            ) : loading ? (
                                <div className="text-yellow-400">Loading your tracks...</div>
                            ) : error ? (
                                <div className="text-red-400">{error}</div>
                            ) : tracks.length === 0 ? (
                                <div className="text-gray-400">No saved tracks found</div>
                            ) : (
                                tracks.map((track, index) => (
                                    <div
                                        key={track.id}
                                        onClick={() => handleTrackClick(track.id)}
                                        className={`
                      cursor-pointer hover:bg-blue-600 hover:text-white px-1 py-1
                      ${selectedSongs.includes(track.id) ? 'bg-blue-600 text-white' : ''}
                    `}
                                    >
                                        {index + 1}. {track.artists.map(a => a.name).join(', ')} - {track.name}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ALL button at bottom */}
                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src="/Buttons/All.png" // Your "ALL SONGS" button image
                            alt="All Songs"
                            onClick={handleSelectAllSongs}
                            className="w-full h-[80%] cursor-pointer hover:opacity-80"
                        />
                    </div>
                </div>
            </div>

            {/* Albums Column */}
            <div className="flex flex-col">
                <div
                    className={`
            relative bg-cover bg-center bg-no-repeat flex-1 flex flex-col
            ${isMobile ? 'h-[200px]' : 'h-[100%]'}
          `}
                    style={{
                        backgroundImage: "url('/Buttons/UI_Background_Choose.png')",
                        backgroundSize: '100% 100%'
                    }}
                >
                    <div className="pt-12 pb-3 px-3">
                        <img
                            src="/ALBUMS.png" // Your "ALBUMS" title image
                            alt="Albums"
                            className="w-full h-auto"
                        />
                    </div>

                    <div className="flex-1 mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto"
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}>
                        <div className="p-2 text-green-400 text-xs font-mono">
                            {!spotifyUser ? (
                                <div className="text-gray-500">Login to Spotify first</div>
                            ) : loading ? (
                                <div className="text-yellow-400">Loading your albums...</div>
                            ) : error ? (
                                <div className="text-red-400">{error}</div>
                            ) : albums.length === 0 ? (
                                <div className="text-gray-400">No saved albums found</div>
                            ) : (
                                albums.map((album, index) => (
                                    <div
                                        key={album.id}
                                        onClick={() => handleAlbumClick(album.id)}
                                        className={`
                      cursor-pointer hover:bg-blue-600 hover:text-white px-1 py-1
                      ${selectedAlbums.includes(album.id) ? 'bg-blue-600 text-white' : ''}
                    `}
                                    >
                                        {album.artists.map(a => a.name).join(', ')} - {album.name}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src="/Buttons/All.png"
                            alt="All Albums"
                            onClick={handleSelectAllAlbums}
                            className="w-full h-[80%] cursor-pointer hover:opacity-80"
                        />
                    </div>
                </div>
            </div>

            {/* Playlists Column */}
            <div className="flex flex-col">
                <div
                    className={`
            relative bg-cover bg-center bg-no-repeat flex-1 flex flex-col
            ${isMobile ? 'h-[200px]' : 'h-[100%]'}
          `}
                    style={{
                        backgroundImage: "url('/Buttons/UI_Background_Choose.png')",
                        backgroundSize: '100% 100%'
                    }}
                >
                    <div className="pt-12 pb-3 px-3">
                        <img
                            src="/PLAYLISTS.png"
                            alt="Playlists"
                            className="w-full h-auto"
                        />
                    </div>

                    <div className="flex-1 mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto"
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}>
                        <div className="p-2 text-green-400 text-xs font-mono">
                            {!spotifyUser ? (
                                <div className="text-gray-500">Login to Spotify first</div>
                            ) : loading ? (
                                <div className="text-yellow-400">Loading your playlists...</div>
                            ) : error ? (
                                <div className="text-red-400">{error}</div>
                            ) : playlists.length === 0 ? (
                                <div className="text-gray-400">No playlists found</div>
                            ) : (
                                playlists.map((playlist, index) => (
                                    <div
                                        key={playlist.id}
                                        onClick={() => handlePlaylistClick(playlist.id)}
                                        className={`
                      cursor-pointer hover:bg-blue-600 hover:text-white px-1 py-1
                      ${selectedPlaylists.includes(playlist.id) ? 'bg-blue-600 text-white' : ''}
                    `}
                                    >
                                        {playlist.name} ({playlist.trackCount} tracks)
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src="/Buttons/All.png" // Your "ALL PLAYLISTS" button image
                            alt="All Playlists"
                            onClick={handleSelectAllPlaylists}
                            className="w-full h-[80%] cursor-pointer hover:opacity-80"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}