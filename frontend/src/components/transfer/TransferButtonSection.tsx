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

interface FailureReport {
    platform: string
    failed_songs: string[]
    failed_albums: string[]
    failed_playlists: { [playlistName: string]: string[] }
    total_failures: number
}

// Platform configuration interface for future extensibility
interface PlatformConfig {
    name: string
    requiresAuth: boolean
    supportsProgress: boolean
    apiEndpoint?: string
    authMethod?: 'oauth' | 'api_key' | 'token'
}

// Platform registry - easily extensible for future platforms
const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
    'TIDAL': {
        name: 'Tidal',
        requiresAuth: true,
        supportsProgress: true,
        apiEndpoint: '/api/transfer',
        authMethod: 'oauth'
    },
    'BANDCAMP': {
        name: 'Bandcamp',
        requiresAuth: false,
        supportsProgress: false
    },
    'APPLE_MUSIC': {
        name: 'Apple Music',
        requiresAuth: true,
        supportsProgress: true,
        apiEndpoint: '/api/apple-music/transfer',
        authMethod: 'oauth'
    },
    'SOUNDCLOUD': {
        name: 'SoundCloud',
        requiresAuth: true,
        supportsProgress: true,
        apiEndpoint: '/api/soundcloud/transfer',
        authMethod: 'oauth'
    },
    'YOUTUBE_MUSIC': {
        name: 'YouTube Music',
        requiresAuth: true,
        supportsProgress: true,
        apiEndpoint: '/api/youtube-music/transfer',
        authMethod: 'oauth'
    }
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
    const [failureReport, setFailureReport] = useState<FailureReport | null>(null)
    const [showDownloadOption, setShowDownloadOption] = useState(false)

    const totalSelected = selectedSongs.length + selectedAlbums.length + selectedPlaylists.length
    const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000'

    const canTransfer = () => {
        return spotifyUser && totalSelected > 0 && selectedPlatform && PLATFORM_CONFIGS[selectedPlatform]
    }

    const getCurrentPlatformConfig = (): PlatformConfig | null => {
        return selectedPlatform ? PLATFORM_CONFIGS[selectedPlatform] : null
    }

    // Progress polling effect for platforms that support it
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null
        const platformConfig = getCurrentPlatformConfig()

        if (currentTransferId && isTransferring && platformConfig?.supportsProgress) {
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

                            // Fetch failure report if available
                            await fetchFailureReport(currentTransferId)

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

    const fetchFailureReport = async (transferId: string) => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/api/transfer/failures/${transferId}`)
            if (response.ok) {
                const report: FailureReport = await response.json()
                if (report.total_failures > 0) {
                    setFailureReport(report)
                    setShowDownloadOption(true)
                }
            }
        } catch (error) {
            console.error('Failed to fetch failure report:', error)
        }
    }

    const downloadFailureReport = () => {
        if (!failureReport) return

        let reportContent = `Transfer Failure Report - ${failureReport.platform}\n`
        reportContent += `Generated: ${new Date().toLocaleString()}\n`
        reportContent += `Total Failures: ${failureReport.total_failures}\n\n`

        // Failed liked songs
        if (failureReport.failed_songs.length > 0) {
            reportContent += `LIKED SONGS NOT FOUND (${failureReport.failed_songs.length}):\n`
            reportContent += failureReport.failed_songs.map(song => `• ${song}`).join('\n')
            reportContent += '\n\n'
        }

        // Failed albums
        if (failureReport.failed_albums.length > 0) {
            reportContent += `ALBUMS NOT FOUND (${failureReport.failed_albums.length}):\n`
            reportContent += failureReport.failed_albums.map(album => `• ${album}`).join('\n')
            reportContent += '\n\n'
        }

        // Failed playlist tracks
        Object.entries(failureReport.failed_playlists).forEach(([playlistName, failedTracks]) => {
            if (failedTracks.length > 0) {
                reportContent += `PLAYLIST "${playlistName}" - TRACKS NOT FOUND (${failedTracks.length}):\n`
                reportContent += failedTracks.map(track => `• ${track}`).join('\n')
                reportContent += '\n\n'
            }
        })

        // Create and download file
        const blob = new Blob([reportContent], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `transfer-failures-${failureReport.platform.toLowerCase()}-${new Date().toISOString().split('T')[0]}.txt`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        // Hide download option after use
        setShowDownloadOption(false)
        setFailureReport(null)
    }

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

                while (foundCount < selectedSongs.length) {
                    const batch = await spotifyAuth.getUserTracks(offset, 50)
                    if (batch.length === 0) break

                    allTracks.push(...batch)
                    foundCount = allTracks.filter(track => selectedSongs.includes(track.id)).length
                    offset += 50
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

                while (foundCount < selectedAlbums.length) {
                    const batch = await spotifyAuth.getUserAlbums(offset, 50)
                    if (batch.length === 0) break

                    allAlbums.push(...batch)
                    foundCount = allAlbums.filter(album => selectedAlbums.includes(album.id)).length
                    offset += 50
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

                while (foundCount < selectedPlaylists.length) {
                    const batch = await spotifyAuth.getUserPlaylists(offset, 50)
                    if (batch.length === 0) break

                    allPlaylists.push(...batch)
                    foundCount = allPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id)).length
                    offset += 50
                    setTransferStatus(`Loading playlists... found ${foundCount}/${selectedPlaylists.length}`)
                }

                const selectedPlaylistsData = allPlaylists.filter(playlist => selectedPlaylists.includes(playlist.id))

                for (let i = 0; i < selectedPlaylistsData.length; i++) {
                    const playlist = selectedPlaylistsData[i]
                    setTransferStatus(`Loading tracks for playlist: ${playlist.name}`)

                    try {
                        const playlistTracks = await spotifyAuth.getPlaylistTracks(playlist.id)
                        const enhancedPlaylist = {
                            ...playlist,
                            tracks: playlistTracks,
                            coverImage: playlist.images?.[0]?.url || playlist.coverImage,
                            description: playlist.description || ''
                        }
                        playlistsToProcess.push(enhancedPlaylist)
                        console.log(`✓ Loaded ${playlistTracks.length} tracks for playlist: ${playlist.name}`)
                    } catch (error) {
                        console.error(`Failed to load tracks for playlist ${playlist.name}:`, error)
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

    const handleTidalTransfer = async (tracksToProcess: SpotifyTrack[], albumsToProcess: SpotifyAlbum[], playlistsToProcess: SpotifyPlaylist[]) => {
        const tidalToken = localStorage.getItem('tidal_access_token')
        if (!tidalToken) {
            alert('Please log in to Tidal first!')
            return false
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tidalToken}`
        }

        const results = []
        let completedOperations = 0
        const totalOperations = (playlistsToProcess.length > 0 ? 1 : 0) +
            (tracksToProcess.length > 0 ? 1 : 0) +
            (albumsToProcess.length > 0 ? 1 : 0)

        // Handle playlists with progress tracking
        if (playlistsToProcess.length > 0) {
            setTransferStatus('Sending playlists to server...')
            const res = await fetch(`${BACKEND_API_URL}/api/transfer/playlists`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ playlists: playlistsToProcess })
            })

            const playlistResult = await res.json()
            if (playlistResult.transfer_id) {
                setCurrentTransferId(playlistResult.transfer_id)
            } else {
                results.push(`Playlists: ${playlistResult.message}`)
                completedOperations++
                setTransferProgress(Math.round((completedOperations / totalOperations) * 100))
            }
        }

        // Handle liked songs
        let songsTransferId = null
        if (tracksToProcess.length > 0) {
            setTransferStatus(`Processing ${tracksToProcess.length} liked songs...`)
            const res = await fetch(`${BACKEND_API_URL}/api/like/songs`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ tracks: tracksToProcess })
            })
            const songResult = await res.json()
            results.push(`Liked Songs: ${songResult.message}`)
            if (songResult.transfer_id) {
                songsTransferId = songResult.transfer_id
            }
            completedOperations++
            setTransferProgress(Math.round((completedOperations / totalOperations) * 100))
        }

        // Handle albums
        let albumsTransferId = null
        if (albumsToProcess.length > 0) {
            setTransferStatus(`Processing ${albumsToProcess.length} albums...`)
            const res = await fetch(`${BACKEND_API_URL}/api/add/albums`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ albums: albumsToProcess })
            })
            const albumResult = await res.json()
            results.push(`Albums: ${albumResult.message}`)
            if (albumResult.transfer_id) {
                albumsTransferId = albumResult.transfer_id
            }
            completedOperations++
            setTransferProgress(Math.round((completedOperations / totalOperations) * 100))
        }

        // If no playlists (so no background transfer), check for failures from songs/albums
        if (playlistsToProcess.length === 0) {
            // Combine all transfer IDs to check for failures
            const transferIds = [currentTransferId, songsTransferId, albumsTransferId].filter(Boolean)

            // Check for failures from any of the operations
            let hasFailures = false
            let combinedReport: FailureReport | null = null

            for (const transferId of transferIds) {
                try {
                    const failureResponse = await fetch(`${BACKEND_API_URL}/api/transfer/failures/${transferId}`)
                    if (failureResponse.ok) {
                        const report: FailureReport = await failureResponse.json()
                        if (report.total_failures > 0) {
                            if (!combinedReport) {
                                combinedReport = {
                                    platform: report.platform,
                                    failed_songs: Array.isArray(report.failed_songs) ? [...report.failed_songs] : [],
                                    failed_albums: Array.isArray(report.failed_albums) ? [...report.failed_albums] : [],
                                    failed_playlists: report.failed_playlists && typeof report.failed_playlists === 'object' ? { ...report.failed_playlists } : {},
                                    total_failures: report.total_failures
                                }
                            } else {
                                // Merge with existing report
                                const newFailedSongs = Array.isArray(report.failed_songs) ? report.failed_songs : []
                                const newFailedAlbums = Array.isArray(report.failed_albums) ? report.failed_albums : []
                                const newFailedPlaylists = report.failed_playlists && typeof report.failed_playlists === 'object' ? report.failed_playlists : {}

                                combinedReport = {
                                    platform: combinedReport.platform,
                                    failed_songs: [...combinedReport.failed_songs, ...newFailedSongs],
                                    failed_albums: [...combinedReport.failed_albums, ...newFailedAlbums],
                                    failed_playlists: Object.assign({}, combinedReport.failed_playlists, newFailedPlaylists),
                                    total_failures: combinedReport.total_failures + report.total_failures
                                }
                            }
                            hasFailures = true
                        }
                    }
                } catch (error) {
                    console.error(`Failed to fetch failure report for ${transferId}:`, error)
                }
            }

            if (hasFailures && combinedReport) {
                setFailureReport(combinedReport)
                setShowDownloadOption(true)
            }

            alert("Transfer completed!\n\n" + results.join("\n"))
            setTransferStatus('Transfer completed!')
            setTimeout(() => {
                setIsTransferring(false)
                setTransferStatus('')
                setTransferProgress(0)
            }, 2000)
        }

        return true
    }

    const handleBandcampTransfer = async (tracksToProcess: SpotifyTrack[], albumsToProcess: SpotifyAlbum[], playlistsToProcess: SpotifyPlaylist[]) => {
        const result = await bandcampIntegration.transferToBandcamp(
            tracksToProcess,
            albumsToProcess,
            playlistsToProcess,
            (progress, status) => {
                setTransferProgress(progress)
                setTransferStatus(status)
            }
        )
        const downloadChoice = confirm(`Bandcamp Guide Ready!\n\nClick OK to download .txt, or Cancel to print/save as PDF.`)
        if (downloadChoice) {
            result.downloadOptions.downloadTxt()
        } else {
            result.downloadOptions.downloadPdf()
        }
        setIsTransferring(false)
        return true
    }

    const handleFuturePlatformTransfer = async (platform: string, tracksToProcess: SpotifyTrack[], albumsToProcess: SpotifyAlbum[], playlistsToProcess: SpotifyPlaylist[]) => {
        const platformConfig = PLATFORM_CONFIGS[platform]
        if (!platformConfig) {
            throw new Error(`Platform ${platform} not configured`)
        }

        // For future platforms, implement their specific transfer logic here
        // This is a placeholder that can be extended when new platforms are added

        setTransferStatus(`${platformConfig.name} transfer not yet implemented`)
        setTimeout(() => {
            setIsTransferring(false)
            setTransferStatus('')
        }, 2000)

        return false
    }

    const handleTransfer = async () => {
        if (!canTransfer() || !selectedPlatform) return

        setIsTransferring(true)
        setTransferStatus('Preparing transfer...')
        setTransferProgress(0)
        setShowDownloadOption(false)
        setFailureReport(null)

        try {
            const { tracksToProcess, albumsToProcess, playlistsToProcess } = await fetchSelectedData()
            let success = false

            // Route to appropriate platform handler
            switch (selectedPlatform) {
                case 'TIDAL':
                    success = await handleTidalTransfer(tracksToProcess, albumsToProcess, playlistsToProcess)
                    break
                case 'BANDCAMP':
                    success = await handleBandcampTransfer(tracksToProcess, albumsToProcess, playlistsToProcess)
                    break
                case 'APPLE_MUSIC':
                case 'SOUNDCLOUD':
                case 'YOUTUBE_MUSIC':
                    success = await handleFuturePlatformTransfer(selectedPlatform, tracksToProcess, albumsToProcess, playlistsToProcess)
                    break
                default:
                    throw new Error(`Unsupported platform: ${selectedPlatform}`)
            }

            if (!success) {
                setIsTransferring(false)
            }

        } catch (error) {
            console.error('Transfer failed:', error)
            alert(`Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
            setTransferStatus('Transfer failed')
            setIsTransferring(false)
            setCurrentTransferId(null)
        }
    }

    const transferReady = canTransfer()
    const platformConfig = getCurrentPlatformConfig()

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

            {/* Download failure report button */}
            {showDownloadOption && failureReport && (
                <div className="absolute top-4 right-4 z-20">
                    <button
                        onClick={downloadFailureReport}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-mono transition-colors"
                        title={`Download report of ${failureReport.total_failures} failed transfers`}
                    >
                        📥 Download Failures ({failureReport.total_failures})
                    </button>
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
                        ? `Transfer ${totalSelected} items to ${platformConfig?.name}`
                        : !spotifyUser
                            ? "Log in to Spotify first"
                            : totalSelected === 0
                                ? "Select music to transfer"
                                : "Select a platform to transfer to"
                }
            />

            {/* Status text */}
            {!isTransferring && (
                <div className="absolute bottom-8 left-0 right-0 text-center">
                    <p className={`text-xs font-mono ${transferReady ? 'text-green-400' : 'text-yellow-400'}`}>
                        {transferReady
                            ? `Ready: ${totalSelected} items → ${platformConfig?.name}`
                            : !spotifyUser
                                ? "Log in to Spotify first"
                                : totalSelected === 0
                                    ? "Select music to transfer"
                                    : "Select a platform to transfer to"
                        }
                    </p>
                </div>
            )}
        </div>
    )
}