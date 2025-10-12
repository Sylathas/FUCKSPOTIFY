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
    // Enhanced progress tracking
    current_song?: string
    songs_processed?: number
    total_songs?: number
    songs_successful?: number
    songs_failed?: number
    current_operation?: string
}

interface FailureReport {
    platform: string
    failed_songs: string[]
    failed_albums: string[]
    failed_playlists: { [playlistName: string]: string[] }
    total_failures: number
}

interface PlatformConfig {
    name: string
    requiresAuth: boolean
    supportsProgress: boolean
    apiEndpoint?: string
    authMethod?: 'oauth' | 'api_key' | 'token'
}

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
    const [showStatusCheckButton, setShowStatusCheckButton] = useState(false)

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
        let backgroundCheckInterval: NodeJS.Timeout | null = null
        let lastSuccessfulPoll = Date.now()
        let consecutiveFailures = 0
        const platformConfig = getCurrentPlatformConfig()

        // Track app visibility for mobile background handling
        const handleVisibilityChange = () => {
            if (document.hidden && isTransferring) {
                console.log('App went to background - transfer may continue in background')
                setTransferStatus('Transfer continuing in background...')
            } else if (!document.hidden && isTransferring) {
                console.log('App returned to foreground - resuming progress checks')
                setTransferStatus('Checking transfer progress...')
                lastSuccessfulPoll = Date.now() // Reset the timer
                consecutiveFailures = 0 // Reset failure count
            }
        }

        // Add visibility change listener
        document.addEventListener('visibilitychange', handleVisibilityChange)

        if (currentTransferId && isTransferring && platformConfig?.supportsProgress) {
            interval = setInterval(async () => {
                try {
                    const response = await fetch(`${BACKEND_API_URL}/api/transfer/progress/${currentTransferId}`)
                    if (response.ok) {
                        const progress: ProgressData = await response.json()
                        setDetailedProgress(progress)
                        setTransferProgress(progress.progress_percent)
                        lastSuccessfulPoll = Date.now()
                        consecutiveFailures = 0

                        if (progress.current_playlist) {
                            setTransferStatus(`${progress.current_step}: ${progress.current_playlist}`)
                        } else {
                            setTransferStatus(progress.current_step)
                        }

                        if (progress.status === 'completed') {
                            setTransferStatus('Transfer completed successfully!')
                            setIsTransferring(false)
                            setCurrentTransferId(null)
                            setShowStatusCheckButton(false)

                            // Fetch failure report from unified transfer
                            await fetchAndCombineAllFailureReports(currentTransferId)

                            setTimeout(() => {
                                setTransferStatus('')
                                setTransferProgress(0)
                                setDetailedProgress(null)
                            }, 3000)
                        } else if (progress.status === 'failed') {
                            setTransferStatus(`Transfer failed: ${progress.current_step}`)
                            setIsTransferring(false)
                            setCurrentTransferId(null)
                            setShowStatusCheckButton(false)
                        }
                    } else if (response.status === 404) {
                        setIsTransferring(false)
                        setCurrentTransferId(null)
                        setTransferStatus('Transfer session expired')
                        setShowStatusCheckButton(false)
                    }
                } catch (error) {
                    console.error('Error polling progress:', error)
                    consecutiveFailures++

                    // If we've had multiple consecutive failures and the app is in background,
                    // don't show error - just indicate transfer is continuing
                    if (consecutiveFailures >= 3 && document.hidden) {
                        setTransferStatus('Transfer continuing in background...')
                        console.log('Multiple polling failures while in background - assuming transfer continues')
                    } else if (consecutiveFailures >= 5) {
                        // Only show error after 5 consecutive failures (10 seconds)
                        setTransferStatus('Lost connection to transfer - please refresh to check status')
                        setShowStatusCheckButton(true)
                        console.log('Too many consecutive polling failures - showing connection lost message')
                    }
                }
            }, 2000)

            // Background check - verify transfer is still running even if polling fails
            backgroundCheckInterval = setInterval(async () => {
                const timeSinceLastPoll = Date.now() - lastSuccessfulPoll

                // If it's been more than 30 seconds since last successful poll and app is in background
                if (timeSinceLastPoll > 30000 && document.hidden && isTransferring) {
                    try {
                        // Try to check if transfer is still running by checking the backend directly
                        const response = await fetch(`${BACKEND_API_URL}/api/transfer/progress/${currentTransferId}`)
                        if (response.ok) {
                            const progress: ProgressData = await response.json()
                            if (progress.status === 'completed') {
                                setTransferStatus('Transfer completed! Please refresh to see results.')
                                setIsTransferring(false)
                                setCurrentTransferId(null)
                            } else if (progress.status === 'failed') {
                                setTransferStatus('Transfer failed. Please refresh to see details.')
                                setIsTransferring(false)
                                setCurrentTransferId(null)
                            } else {
                                // Transfer is still running
                                setTransferStatus('Transfer continuing in background...')
                                lastSuccessfulPoll = Date.now()
                                consecutiveFailures = 0
                            }
                        }
                    } catch (error) {
                        console.log('Background check failed - transfer may still be running')
                    }
                }
            }, 10000) // Check every 10 seconds
        }

        return () => {
            if (interval) clearInterval(interval)
            if (backgroundCheckInterval) clearInterval(backgroundCheckInterval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [currentTransferId, isTransferring, selectedPlatform, BACKEND_API_URL])

    const fetchAndCombineAllFailureReports = async (transferId: string) => {
        try {
            console.log('Fetching failure report for unified transfer:', transferId)

            const response = await fetch(`${BACKEND_API_URL}/api/transfer/failures/${transferId}`)
            if (response.ok) {
                const report: FailureReport = await response.json()
                console.log('Fetched unified failure report:', report)

                if (report.total_failures > 0) {
                    setFailureReport(report)
                    setShowDownloadOption(true)
                    console.log('Set download option to true for unified transfer with failures')
                } else {
                    console.log('No failures in unified transfer')
                }
            } else {
                console.log('Failed to fetch failure report, status:', response.status)
            }
        } catch (error) {
            console.error('Failed to fetch failure report:', error)
        }
    }

    const checkTransferStatus = async () => {
        if (!currentTransferId) return

        try {
            setTransferStatus('Checking transfer status...')
            const response = await fetch(`${BACKEND_API_URL}/api/transfer/progress/${currentTransferId}`)

            if (response.ok) {
                const progress: ProgressData = await response.json()
                setDetailedProgress(progress)
                setTransferProgress(progress.progress_percent)
                setShowStatusCheckButton(false)

                if (progress.status === 'completed') {
                    setTransferStatus('Transfer completed successfully!')
                    setIsTransferring(false)
                    setCurrentTransferId(null)

                    // Fetch failure reports
                    await fetchAndCombineAllFailureReports(currentTransferId)

                    setTimeout(() => {
                        setTransferStatus('')
                        setTransferProgress(0)
                        setDetailedProgress(null)
                    }, 3000)
                } else if (progress.status === 'failed') {
                    setTransferStatus(`Transfer failed: ${progress.current_step}`)
                    setIsTransferring(false)
                    setCurrentTransferId(null)
                } else {
                    setTransferStatus(progress.current_step)
                    // Transfer is still running, resume normal polling
                    setShowStatusCheckButton(false)
                }
            } else if (response.status === 404) {
                setTransferStatus('Transfer session expired')
                setIsTransferring(false)
                setCurrentTransferId(null)
                setShowStatusCheckButton(false)
            }
        } catch (error) {
            console.error('Error checking transfer status:', error)
            setTransferStatus('Unable to check status - transfer may still be running')
        }
    }

    const downloadFailureReport = () => {
        if (!failureReport) {
            console.error('No failure report available for download')
            return
        }

        try {
            let reportContent = `Transfer Failure Report - ${failureReport.platform}\n`
            reportContent += `Generated: ${new Date().toLocaleString()}\n`
            reportContent += `Total Failures: ${failureReport.total_failures}\n\n`

            // Failed liked songs
            if (failureReport.failed_songs && failureReport.failed_songs.length > 0) {
                reportContent += `LIKED SONGS NOT FOUND (${failureReport.failed_songs.length}):\n`
                reportContent += failureReport.failed_songs.map(song => `• ${song}`).join('\n')
                reportContent += '\n\n'
            }

            // Failed albums
            if (failureReport.failed_albums && failureReport.failed_albums.length > 0) {
                reportContent += `ALBUMS NOT FOUND (${failureReport.failed_albums.length}):\n`
                reportContent += failureReport.failed_albums.map(album => `• ${album}`).join('\n')
                reportContent += '\n\n'
            }

            // Failed playlist tracks
            if (failureReport.failed_playlists && typeof failureReport.failed_playlists === 'object') {
                Object.entries(failureReport.failed_playlists).forEach(([playlistName, failedTracks]) => {
                    if (Array.isArray(failedTracks) && failedTracks.length > 0) {
                        reportContent += `PLAYLIST "${playlistName}" - TRACKS NOT FOUND (${failedTracks.length}):\n`
                        reportContent += failedTracks.map(track => `• ${track}`).join('\n')
                        reportContent += '\n\n'
                    }
                })
            }

            // Add summary at the end
            reportContent += `\n--- SUMMARY ---\n`
            reportContent += `Total Failed Songs: ${failureReport.failed_songs?.length || 0}\n`
            reportContent += `Total Failed Albums: ${failureReport.failed_albums?.length || 0}\n`
            reportContent += `Total Failed Playlist Tracks: ${Object.values(failureReport.failed_playlists || {}).reduce((sum, tracks) => sum + (Array.isArray(tracks) ? tracks.length : 0), 0)}\n`
            reportContent += `Total Failures: ${failureReport.total_failures}\n`

            // Create and download file
            const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `transfer-failures-${failureReport.platform.toLowerCase()}-${new Date().toISOString().split('T')[0]}.txt`
            link.style.display = 'none'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)

            // Clear download option and failure report after successful download
            setShowDownloadOption(false)
            setFailureReport(null)

            console.log('Successfully downloaded failure report')
        } catch (error) {
            console.error('Failed to download failure report:', error)
            alert('Failed to download failure report. Please try again.')
        }
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

        try {
            setTransferStatus('Sending all data to server...')

            // Use the new unified transfer endpoint
            const res = await fetch(`${BACKEND_API_URL}/api/transfer/unified`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    tracks: tracksToProcess,
                    albums: albumsToProcess,
                    playlists: playlistsToProcess
                })
            })

            if (!res.ok) {
                if (res.status === 401) {
                    throw new Error('401 Unauthorized - Please log in to Tidal again')
                }
                throw new Error(`HTTP ${res.status}: ${res.statusText}`)
            }

            const result = await res.json()
            console.log('Unified transfer response:', result)

            if (result.transfer_id) {
                setCurrentTransferId(result.transfer_id)
                setTransferStatus('Transfer started - processing all items...')
                // The progress polling will handle the rest
                return true
            } else {
                throw new Error('No transfer ID received from server')
            }

        } catch (error) {
            throw new Error(`Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
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
        // Clear any previous transfer ID
        setCurrentTransferId(null)

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

            // Handle specific error types
            let errorMessage = 'Unknown error'
            if (error instanceof Error) {
                if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                    errorMessage = 'Your Tidal login has expired. Please log in to Tidal again.'
                    // Clear the expired token
                    localStorage.removeItem('tidal_access_token')
                } else if (error.message.includes('Failed to fetch')) {
                    errorMessage = 'Network error. Please check your internet connection and try again.'
                } else if (error.message.includes('CORS')) {
                    errorMessage = 'Server connection error. Please try again later.'
                } else {
                    errorMessage = error.message
                }
            }

            alert(`Transfer failed: ${errorMessage}`)
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

                    {/* Enhanced progress for songs/albums */}
                    {detailedProgress && detailedProgress.total_songs && detailedProgress.total_songs > 0 && (
                        <div className="text-xs text-center font-mono px-2 space-y-1">
                            <p className="text-blue-400">
                                {detailedProgress.current_operation === 'liking' ? 'Liking' :
                                    detailedProgress.current_operation === 'adding_albums' ? 'Adding' : 'Processing'}
                                {detailedProgress.songs_processed || 0} of {detailedProgress.total_songs}
                            </p>
                            {detailedProgress.current_song && (
                                <p className="text-gray-300 truncate max-w-xs mx-auto">
                                    "{detailedProgress.current_song}"
                                </p>
                            )}
                            {(detailedProgress.songs_successful || detailedProgress.songs_failed) && (
                                <p className="text-green-400">
                                    ✓ {detailedProgress.songs_successful || 0} successful
                                    {detailedProgress.songs_failed && detailedProgress.songs_failed > 0 && (
                                        <span className="text-red-400"> • ✗ {detailedProgress.songs_failed} failed</span>
                                    )}
                                </p>
                            )}
                        </div>
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

            {/* Check transfer status button */}
            {showStatusCheckButton && (
                <div className="absolute top-4 left-4 z-20">
                    <button
                        onClick={checkTransferStatus}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm font-mono transition-colors"
                        title="Check if transfer is still running"
                    >
                        🔄 Check Status
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