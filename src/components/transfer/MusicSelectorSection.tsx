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

    // Total counts
    const [totalTracks, setTotalTracks] = useState<number | null>(null)
    const [totalAlbums, setTotalAlbums] = useState<number | null>(null)
    const [totalPlaylists, setTotalPlaylists] = useState<number | null>(null)

    // Loading states
    const [loadingTracks, setLoadingTracks] = useState(false)
    const [loadingAlbums, setLoadingAlbums] = useState(false)
    const [loadingPlaylists, setLoadingPlaylists] = useState(false)

    // Pagination states
    const [hasMoreTracks, setHasMoreTracks] = useState(true)
    const [hasMoreAlbums, setHasMoreAlbums] = useState(true)
    const [hasMorePlaylists, setHasMorePlaylists] = useState(true)

    // Select All loading states
    const [selectingAllTracks, setSelectingAllTracks] = useState(false)
    const [selectingAllAlbums, setSelectingAllAlbums] = useState(false)
    const [selectingAllPlaylists, setSelectingAllPlaylists] = useState(false)

    // Refs for scroll containers
    const tracksScrollRef = useRef<HTMLDivElement>(null)
    const albumsScrollRef = useRef<HTMLDivElement>(null)
    const playlistsScrollRef = useRef<HTMLDivElement>(null)

    // Load initial data when user logs in
    useEffect(() => {
        if (spotifyUser) {
            loadInitialData()
        } else {
            // Clear everything
            setTracks([])
            setAlbums([])
            setPlaylists([])
            setTotalTracks(null)
            setTotalAlbums(null)
            setTotalPlaylists(null)
        }
    }, [spotifyUser])

    const loadInitialData = async () => {
        await Promise.all([
            loadMoreTracks(true),
            loadMoreAlbums(true),
            loadMorePlaylists(true)
        ])
    }

    // Load ALL items for select all functionality
    const loadAllTracks = async () => {
        const allTracks = []
        let offset = 0
        while (true) {
            const batch = await spotifyAuth.getUserTracks(offset, 50)
            allTracks.push(...batch)
            if (batch.length < 50) break
            offset += 50
        }
        setTotalTracks(allTracks.length)
        return allTracks
    }

    const loadAllAlbums = async () => {
        const allAlbums = []
        let offset = 0
        while (true) {
            const batch = await spotifyAuth.getUserAlbums(offset, 50)
            allAlbums.push(...batch)
            if (batch.length < 50) break
            offset += 50
        }
        setTotalAlbums(allAlbums.length)
        return allAlbums
    }

    const loadAllPlaylists = async () => {
        const allPlaylists = []
        let offset = 0
        while (true) {
            const batch = await spotifyAuth.getUserPlaylists(offset, 50)
            allPlaylists.push(...batch)
            if (batch.length < 50) break
            offset += 50
        }
        setTotalPlaylists(allPlaylists.length)
        return allPlaylists
    }

    // Regular pagination loading
    const loadMoreTracks = async (reset = false) => {
        if (loadingTracks || (!hasMoreTracks && !reset)) return
        setLoadingTracks(true)
        try {
            const offset = reset ? 0 : tracks.length
            const response = await spotifyAuth.getUserTracks(offset, 50)

            if (reset) {
                setTracks(response)
                // Get total count in background
                if (response.length === 50) {
                    loadAllTracks().then(allTracks => {
                        setTotalTracks(allTracks.length)
                    })
                } else {
                    setTotalTracks(response.length)
                }
            } else {
                setTracks(prev => [...prev, ...response])
            }
            setHasMoreTracks(response.length === 50)
        } catch (error) {
            console.error('Error loading tracks:', error)
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
                if (response.length === 50) {
                    loadAllAlbums().then(allAlbums => {
                        setTotalAlbums(allAlbums.length)
                    })
                } else {
                    setTotalAlbums(response.length)
                }
            } else {
                setAlbums(prev => [...prev, ...response])
            }
            setHasMoreAlbums(response.length === 50)
        } catch (error) {
            console.error('Error loading albums:', error)
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
                if (response.length === 50) {
                    loadAllPlaylists().then(allPlaylists => {
                        setTotalPlaylists(allPlaylists.length)
                    })
                } else {
                    setTotalPlaylists(response.length)
                }
            } else {
                setPlaylists(prev => [...prev, ...response])
            }
            setHasMorePlaylists(response.length === 50)
        } catch (error) {
            console.error('Error loading playlists:', error)
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

    // Select All handlers - always select/deselect ALL items
    const handleSelectAllTracks = async () => {
        if (!spotifyUser) return

        if (selectedSongs.length > 0) {
            // Deselect all
            onSelectSongs([])
        } else {
            // Select all
            setSelectingAllTracks(true)
            try {
                const allTracks = await loadAllTracks()
                onSelectSongs(allTracks.map(t => t.id))
            } catch (error) {
                console.error('Error selecting all tracks:', error)
            } finally {
                setSelectingAllTracks(false)
            }
        }
    }

    const handleSelectAllAlbums = async () => {
        if (!spotifyUser) return

        if (selectedAlbums.length > 0) {
            onSelectAlbums([])
        } else {
            setSelectingAllAlbums(true)
            try {
                const allAlbums = await loadAllAlbums()
                onSelectAlbums(allAlbums.map(a => a.id))
            } catch (error) {
                console.error('Error selecting all albums:', error)
            } finally {
                setSelectingAllAlbums(false)
            }
        }
    }

    const handleSelectAllPlaylists = async () => {
        if (!spotifyUser) return

        if (selectedPlaylists.length > 0) {
            onSelectPlaylists([])
        } else {
            setSelectingAllPlaylists(true)
            try {
                const allPlaylists = await loadAllPlaylists()
                onSelectPlaylists(allPlaylists.map(p => p.id))
            } catch (error) {
                console.error('Error selecting all playlists:', error)
            } finally {
                setSelectingAllPlaylists(false)
            }
        }
    }

    return (
        <div className={`grid h-full ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>

            {/* SONGS */}
            <div className="flex flex-col">
                <div
                    className={`relative bg-cover bg-center bg-no-repeat flex-1 flex flex-col ${isMobile ? 'h-[200px]' : 'h-[100%]'}`}
                    style={{
                        backgroundImage: "url('/Buttons/UI_Background_Choose.png')",
                        backgroundSize: '100% 100%'
                    }}
                >
                    {/* Title */}
                    <div className="pt-12 pb-3 px-3">
                        <img src="/SONGS.png" alt="Songs" className="w-full h-auto" />
                    </div>

                    {/* Scrollable list */}
                    <div
                        ref={tracksScrollRef}
                        onScroll={handleTracksScroll}
                        className={`mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto ${isMobile ? 'h-32' : 'h-[260px]'}`}
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        {/* Pinned counter */}
                        <div className="sticky top-0 bg-black border-b border-gray-600 p-2 z-10">
                            <div className="text-yellow-400 text-center text-xs font-mono">
                                {!spotifyUser
                                    ? "Log in to Spotify to display songs"
                                    : `${selectedSongs.length} selected${totalTracks ? ` of ${totalTracks} total` : ''}`
                                }
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-2 text-green-400 text-xs font-mono">
                            {tracks.map((track, index) => (
                                <div
                                    key={track.id}
                                    onClick={() => handleTrackClick(track.id)}
                                    className={`cursor-pointer hover:bg-blue-600 hover:text-white px-1 py-1 ${selectedSongs.includes(track.id) ? 'bg-blue-600 text-white' : ''
                                        }`}
                                >
                                    {index + 1}. {track.artists.map(a => a.name).join(', ')} - {track.name}
                                </div>
                            ))}
                            {loadingTracks && (
                                <div className="text-yellow-400 text-center py-2">Loading more tracks...</div>
                            )}
                        </div>
                    </div>

                    {/* Select All button */}
                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src={selectedSongs.length > 0 ? "/Buttons/All_Selected.png" : "/Buttons/All.png"}
                            alt={selectedSongs.length > 0 ? "Deselect All" : "Select All"}
                            onClick={handleSelectAllTracks}
                            className={`w-full h-[80%] cursor-pointer hover:opacity-80 ${selectingAllTracks ? 'opacity-50' : ''
                                }`}
                            title={selectingAllTracks ? "Loading..." : selectedSongs.length > 0 ? "Deselect All" : "Select All"}
                        />
                    </div>
                </div>
            </div>

            {/* ALBUMS */}
            <div className="flex flex-col">
                <div
                    className={`relative bg-cover bg-center bg-no-repeat flex-1 flex flex-col ${isMobile ? 'h-[200px]' : 'h-[100%]'}`}
                    style={{
                        backgroundImage: "url('/Buttons/UI_Background_Choose.png')",
                        backgroundSize: '100% 100%'
                    }}
                >
                    <div className="pt-12 pb-3 px-3">
                        <img src="/ALBUMS.png" alt="Albums" className="w-full h-auto" />
                    </div>

                    <div
                        ref={albumsScrollRef}
                        onScroll={handleAlbumsScroll}
                        className={`mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto ${isMobile ? 'h-32' : 'h-[260px]'}`}
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div className="sticky top-0 bg-black border-b border-gray-600 p-2 z-10">
                            <div className="text-yellow-400 text-center text-xs font-mono">
                                {!spotifyUser
                                    ? "Log in to Spotify to display albums"
                                    : `${selectedAlbums.length} selected${totalAlbums ? ` of ${totalAlbums} total` : ''}`
                                }
                            </div>
                        </div>

                        <div className="p-2 text-green-400 text-xs font-mono">
                            {albums.map((album) => (
                                <div
                                    key={album.id}
                                    onClick={() => handleAlbumClick(album.id)}
                                    className={`cursor-pointer hover:bg-blue-600 hover:text-white px-1 py-1 ${selectedAlbums.includes(album.id) ? 'bg-blue-600 text-white' : ''
                                        }`}
                                >
                                    {album.artists.map(a => a.name).join(', ')} - {album.name}
                                </div>
                            ))}
                            {loadingAlbums && (
                                <div className="text-yellow-400 text-center py-2">Loading more albums...</div>
                            )}
                        </div>
                    </div>

                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src={selectedAlbums.length > 0 ? "/Buttons/All_Selected.png" : "/Buttons/All.png"}
                            alt={selectedAlbums.length > 0 ? "Deselect All" : "Select All"}
                            onClick={handleSelectAllAlbums}
                            className={`w-full h-[80%] cursor-pointer hover:opacity-80 ${selectingAllAlbums ? 'opacity-50' : ''
                                }`}
                            title={selectingAllAlbums ? "Loading..." : selectedAlbums.length > 0 ? "Deselect All" : "Select All"}
                        />
                    </div>
                </div>
            </div>

            {/* PLAYLISTS */}
            <div className="flex flex-col">
                <div
                    className={`relative bg-cover bg-center bg-no-repeat flex-1 flex flex-col ${isMobile ? 'h-[200px]' : 'h-[100%]'}`}
                    style={{
                        backgroundImage: "url('/Buttons/UI_Background_Choose.png')",
                        backgroundSize: '100% 100%'
                    }}
                >
                    <div className="pt-12 pb-3 px-3">
                        <img src="/PLAYLISTS.png" alt="Playlists" className="w-full h-auto" />
                    </div>

                    <div
                        ref={playlistsScrollRef}
                        onScroll={handlePlaylistsScroll}
                        className={`mx-2 mb-2 bg-black border-2 border-gray-600 overflow-auto ${isMobile ? 'h-32' : 'h-[260px]'}`}
                        style={{
                            borderStyle: 'inset',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div className="sticky top-0 bg-black border-b border-gray-600 p-2 z-10">
                            <div className="text-yellow-400 text-center text-xs font-mono">
                                {!spotifyUser
                                    ? "Log in to Spotify to display playlists"
                                    : `${selectedPlaylists.length} selected${totalPlaylists ? ` of ${totalPlaylists} total` : ''}`
                                }
                            </div>
                        </div>

                        <div className="p-2 text-green-400 text-xs font-mono">
                            {playlists.map((playlist) => (
                                <div
                                    key={playlist.id}
                                    onClick={() => handlePlaylistClick(playlist.id)}
                                    className={`cursor-pointer hover:bg-blue-600 hover:text-white px-1 py-1 ${selectedPlaylists.includes(playlist.id) ? 'bg-blue-600 text-white' : ''
                                        }`}
                                >
                                    {playlist.name} ({playlist.trackCount} tracks)
                                </div>
                            ))}
                            {loadingPlaylists && (
                                <div className="text-yellow-400 text-center py-2">Loading more playlists...</div>
                            )}
                        </div>
                    </div>

                    <div className="pb-5 px-2 h-[60px]">
                        <img
                            src={selectedPlaylists.length > 0 ? "/Buttons/All_Selected.png" : "/Buttons/All.png"}
                            alt={selectedPlaylists.length > 0 ? "Deselect All" : "Select All"}
                            onClick={handleSelectAllPlaylists}
                            className={`w-full h-[80%] cursor-pointer hover:opacity-80 ${selectingAllPlaylists ? 'opacity-50' : ''
                                }`}
                            title={selectingAllPlaylists ? "Loading..." : selectedPlaylists.length > 0 ? "Deselect All" : "Select All"}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}