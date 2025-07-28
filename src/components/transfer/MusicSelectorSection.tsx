import { useEffect, useState, useRef, useCallback } from 'react'
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

    // Data states
    const [tracks, setTracks] = useState<SpotifyTrack[]>([])
    const [albums, setAlbums] = useState<SpotifyAlbum[]>([])
    const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])

    // Loading states
    const [loadingTracks, setLoadingTracks] = useState(false)
    const [loadingAlbums, setLoadingAlbums] = useState(false)
    const [loadingPlaylists, setLoadingPlaylists] = useState(false)

    // Pagination states
    const [hasMoreTracks, setHasMoreTracks] = useState(true)
    const [hasMoreAlbums, setHasMoreAlbums] = useState(true)
    const [hasMorePlaylists, setHasMorePlaylists] = useState(true)

    const [error, setError] = useState<string | null>(null)

    // Refs for scroll containers
    const tracksScrollRef = useRef<HTMLDivElement>(null)
    const albumsScrollRef = useRef<HTMLDivElement>(null)
    const playlistsScrollRef = useRef<HTMLDivElement>(null)

    // Load initial data when user logs in
    useEffect(() => {
        console.log('MusicSelectorSection: spotifyUser changed:', spotifyUser)

        if (spotifyUser) {
            console.log('Loading initial Spotify data for user:', spotifyUser)
            loadInitialData()
        } else {
            // Clear data when user logs out
            console.log('No spotify user, clearing data')
            setTracks([])
            setAlbums([])
            setPlaylists([])
            setHasMoreTracks(true)
            setHasMoreAlbums(true)
            setHasMorePlaylists(true)
        }
    }, [spotifyUser])

    const loadInitialData = async () => {
        setError(null)
        try {
            // Load first batch of each type
            await Promise.all([
                loadMoreTracks(true),
                loadMoreAlbums(true),
                loadMorePlaylists(true)
            ])
        } catch (error) {
            console.error('Error loading initial Spotify data:', error)
            setError('Failed to load your Spotify library')
        }
    }

    const loadMoreTracks = async (reset = false) => {
        if (loadingTracks || (!hasMoreTracks && !reset)) return

        setLoadingTracks(true)
        try {
            const offset = reset ? 0 : tracks.length
            const response = await spotifyAuth.getUserTracks(offset, 50)

            if (reset) {
                setTracks(response)
            } else {
                setTracks(prev => [...prev, ...response])
            }

            // If we got less than 50, we've reached the end
            setHasMoreTracks(response.length === 50)
        } catch (error) {
            console.error('Error loading tracks:', error)
            if (error instanceof Error && error.message.includes('Not authenticated')) {
                setError('Authentication expired. Please log in again.')
                // Clear stored user data
                localStorage.removeItem('spotify_user')
                localStorage.removeItem('spotify_access_token')
            }
        } finally {
            setLoadingTracks(false)
        }
    }

    const loadMoreAlbums = async (reset = false) => {
        if (loadingAlbums || (!hasMoreAlbums && !reset)) return

        setLoadingAlbums(true)
        try {
            const offset = reset ? 0 : albums.length
            const response = await spotifyAuth.getUserAlbums(offset, 50)

            if (reset) {
                setAlbums(response)
            } else {
                setAlbums(prev => [...prev, ...response])
            }

            setHasMoreAlbums(response.length === 50)
        } catch (error) {
            console.error('Error loading albums:', error)
            if (error instanceof Error && error.message.includes('Not authenticated')) {
                setError('Authentication expired. Please log in again.')
            }
        } finally {
            setLoadingAlbums(false)
        }
    }

    const loadMorePlaylists = async (reset = false) => {
        if (loadingPlaylists || (!hasMorePlaylists && !reset)) return

        setLoadingPlaylists(true)
        try {
            const offset = reset ? 0 : playlists.length
            const response = await spotifyAuth.getUserPlaylists(offset, 50)

            if (reset) {
                setPlaylists(response)
            } else {
                setPlaylists(prev => [...prev, ...response])
            }

            setHasMorePlaylists(response.length === 50)
        } catch (error) {
            console.error('Error loading playlists:', error)
            if (error instanceof Error && error.message.includes('Not authenticated')) {
                setError('Authentication expired. Please log in again.')
            }
        } finally {
            setLoadingPlaylists(false)
        }
    }

    // Scroll handlers for infinite loading
    const handleTracksScroll = useCallback(() => {
        const container = tracksScrollRef.current
        if (!container || loadingTracks || !hasMoreTracks) return

        const { scrollTop, scrollHeight, clientHeight } = container
        if (scrollTop + clientHeight >= scrollHeight - 10) {
            loadMoreTracks()
        }
    }, [loadingTracks, hasMoreTracks])

    const handleAlbumsScroll = useCallback(() => {
        const container = albumsScrollRef.current
        if (!container || loadingAlbums || !hasMoreAlbums) return

        const { scrollTop, scrollHeight, clientHeight } = container
        if (scrollTop + clientHeight >= scrollHeight - 10) {
            loadMoreAlbums()
        }
    }, [loadingAlbums, hasMoreAlbums])

    const handlePlaylistsScroll = useCallback(() => {
        const container = playlistsScrollRef.current
        if (!container || loadingPlaylists || !hasMorePlaylists) return

        const { scrollTop, scrollHeight, clientHeight } = container
        if (scrollTop + clientHeight >= scrollHeight - 10) {
            loadMorePlaylists()
        }
    }, [loadingPlaylists, hasMorePlaylists])

    // Selection handlers
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
                            src="/SONGS.png"
                            alt="Songs"
                            className="w-full h-auto"
                        />
                    </div>

                    <div
                        ref={tracksScrollRef}
                        onScroll={handleTracksScroll}
                        className={`
              mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto
              ${isMobile ? 'h-32' : 'h-48'}
            `}
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div className="p-2 text-green-400 text-xs font-mono">
                            {!spotifyUser ? (
                                <div className="text-red-400">Please log in to Spotify first</div>
                            ) : error ? (
                                <div className="text-red-400">{error}</div>
                            ) : tracks.length === 0 && !loadingTracks ? (
                                <div className="text-gray-400">No saved tracks found</div>
                            ) : (
                                <>
                                    {tracks.map((track, index) => (
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
                                    ))}
                                    {loadingTracks && (
                                        <div className="text-yellow-400 text-center py-2">Loading more tracks...</div>
                                    )}
                                    {!hasMoreTracks && tracks.length > 0 && (
                                        <div className="text-gray-400 text-center py-2">No more tracks</div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src="/Buttons/All.png"
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
                            src="/ALBUMS.png"
                            alt="Albums"
                            className="w-full h-auto"
                        />
                    </div>

                    <div
                        ref={albumsScrollRef}
                        onScroll={handleAlbumsScroll}
                        className={`
              mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto
              ${isMobile ? 'h-32' : 'h-48'}
            `}
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div className="p-2 text-green-400 text-xs font-mono">
                            {!spotifyUser ? (
                                <div className="text-red-400">Please log in to Spotify first</div>
                            ) : error ? (
                                <div className="text-red-400">{error}</div>
                            ) : albums.length === 0 && !loadingAlbums ? (
                                <div className="text-gray-400">No saved albums found</div>
                            ) : (
                                <>
                                    {albums.map((album) => (
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
                                    ))}
                                    {loadingAlbums && (
                                        <div className="text-yellow-400 text-center py-2">Loading more albums...</div>
                                    )}
                                    {!hasMoreAlbums && albums.length > 0 && (
                                        <div className="text-gray-400 text-center py-2">No more albums</div>
                                    )}
                                </>
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

                    <div
                        ref={playlistsScrollRef}
                        onScroll={handlePlaylistsScroll}
                        className={`
              mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto
              ${isMobile ? 'h-32' : 'h-48'}
            `}
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div className="p-2 text-green-400 text-xs font-mono">
                            {!spotifyUser ? (
                                <div className="text-red-400">Please log in to Spotify first</div>
                            ) : error ? (
                                <div className="text-red-400">{error}</div>
                            ) : playlists.length === 0 && !loadingPlaylists ? (
                                <div className="text-gray-400">No playlists found</div>
                            ) : (
                                <>
                                    {playlists.map((playlist) => (
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
                                    ))}
                                    {loadingPlaylists && (
                                        <div className="text-yellow-400 text-center py-2">Loading more playlists...</div>
                                    )}
                                    {!hasMorePlaylists && playlists.length > 0 && (
                                        <div className="text-gray-400 text-center py-2">No more playlists</div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src="/Buttons/All.png"
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