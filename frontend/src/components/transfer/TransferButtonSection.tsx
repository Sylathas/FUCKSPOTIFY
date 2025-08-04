import { bandcampIntegration } from '@/lib/bandcamp'
import { useState, useEffect } from 'react'
import { spotifyAuth } from '@/lib/spotify'
import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// ===== TYPES =====
interface TransferButtonProps {
    isMobile: boolean
    spotifyUser: any
    selectedSongs: string[]
    selectedAlbums: string[]
    selectedPlaylists: string[]
    selectedPlatform: string | null
}

interface TransferState {
    isTransferring: boolean
    status: string
    progress: number
    transferId: string | null
}

interface FailureReport {
    platform: string
    failed_songs: string[]
    failed_albums: string[]
    failed_playlists: { [key: string]: string[] }
    total_failures: number
}

// ===== HOOKS =====
const useTransferState = () => {
    const [state, setState] = useState<TransferState>({
        isTransferring: false,
        status: '',
        progress: 0,
        transferId: null
    })

    const updateState = (updates: Partial<TransferState>) => {
        setState(prev => ({ ...prev, ...updates }))
    }

    const resetState = () => {
        setState({
            isTransferring: false,
            status: '',
            progress: 0,
            transferId: null
        })
    }

    return { state, updateState, resetState }
}

const useFailureReports = () => {
    const [failureReport, setFailureReport] = useState<FailureReport | null>(null)
    const [showDownload, setShowDownload] = useState(false)

    const downloadReport = () => {
        if (!failureReport) return

        let content = `Transfer Failure Report - ${failureReport.platform}\n`
        content += `Generated: ${new Date().toLocaleString()}\n`
        content += `Total Failures: ${failureReport.total_failures}\n\n`

        // Add sections for failed items
        if (failureReport.failed_songs.length > 0) {
            content += `LIKED SONGS NOT FOUND (${failureReport.failed_songs.length}):\n`
            content += failureReport.failed_songs.map(song => `• ${song}`).join('\n') + '\n\n'
        }

        if (failureReport.failed_albums.length > 0) {
            content += `ALBUMS NOT FOUND (${failureReport.failed_albums.length}):\n`
            content += failureReport.failed_albums.map(album => `• ${album}`).join('\n') + '\n\n'
        }

        Object.entries(failureReport.failed_playlists).forEach(([name, tracks]) => {
            if (tracks.length > 0) {
                content += `PLAYLIST "${name}" - TRACKS NOT FOUND (${tracks.length}):\n`
                content += tracks.map(track => `• ${track}`).join('\n') + '\n\n'
            }
        })

        // Create download
        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `transfer-failures-${failureReport.platform.toLowerCase()}-${new Date().toISOString().split('T')[0]}.txt`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        setShowDownload(false)
        setFailureReport(null)
    }

    return {
        failureReport,
        showDownload,
        setFailureReport,
        setShowDownload,
        downloadReport
    }
}

// ===== PROGRESS OVERLAY COMPONENT =====
const TransferProgress = ({
    isVisible,
    progress,
    status
}: {
    isVisible: boolean
    progress: number
    status: string
}) => {
    if (!isVisible) return null

    return (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-10 rounded">
            <div className="w-3/4 bg-gray-700 rounded-full h-3 mb-3">
                {progress > 0 && (
                    <div
                        className="bg-green-400 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                )}
            </div>
            <p className="text-green-400 text-sm text-center font-mono px-2">
                {status}
            </p>
        </div>
    )
}

// ===== FAILURE REPORT BUTTON =====
const FailureReportButton = ({
    failureReport,
    showDownload,
    onDownload
}: {
    failureReport: FailureReport | null
    showDownload: boolean
    onDownload: () => void
}) => {
    if (!showDownload || !failureReport) return null

    return (
        <div className="absolute top-4 right-4 z-20">
            <button
                onClick={onDownload}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-mono transition-colors"
                title={`Download report of ${failureReport.total_failures} failed transfers`}
            >
                📥 Download Failures ({failureReport.total_failures})
            </button>
        </div>
    )
}

// ===== TRANSFER SERVICE =====
class TransferService {
    private static BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000'

    static async fetchSpotifyData(
        selectedSongs: string[],
        selectedAlbums: string[],
        selectedPlaylists: string[],
        onProgress: (status: string) => void
    ) {
        const results: {
            tracks: SpotifyTrack[]
            albums: SpotifyAlbum[]
            playlists: SpotifyPlaylist[]
        } = { tracks: [], albums: [], playlists: [] }

        // Fetch tracks
        if (selectedSongs.length > 0) {
            onProgress(`Loading ${selectedSongs.length} tracks...`)
            let offset = 0
            let foundTracks = []

            while (foundTracks.length < selectedSongs.length) {
                const batch = await spotifyAuth.getUserTracks(offset, 50)
                if (batch.length === 0) break

                const matchingTracks = batch.filter(track => selectedSongs.includes(track.id))
                foundTracks.push(...matchingTracks)
                offset += 50
            }
            results.tracks = foundTracks
        }

        // Fetch albums (similar logic)
        if (selectedAlbums.length > 0) {
            onProgress(`Loading ${selectedAlbums.length} albums...`)
            // Similar implementation...
            results.albums = [] // Implement album fetching
        }

        // Fetch playlists (similar logic)
        if (selectedPlaylists.length > 0) {
            onProgress(`Loading ${selectedPlaylists.length} playlists...`)
            // Similar implementation...
            results.playlists = [] // Implement playlist fetching
        }

        return results
    }

    static async transferToTidal(data: any, onProgress: (progress: number, status: string) => void) {
        const token = localStorage.getItem('tidal_access_token')
        if (!token) throw new Error('Tidal token not found')

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }

        // Transfer playlists
        if (data.playlists.length > 0) {
            const response = await fetch(`${this.BACKEND_URL}/api/transfer/playlists`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ playlists: data.playlists })
            })
            return await response.json()
        }

        // Handle other transfers...
        return { success: true }
    }

    static async transferToBandcamp(data: any, onProgress: (progress: number, status: string) => void) {
        // Use existing bandcamp integration
        return await bandcampIntegration.transferToBandcamp(
            data.tracks,
            data.albums,
            data.playlists,
            onProgress
        )
    }
}

// ===== MAIN COMPONENT =====
export default function TransferButtonSection({
    isMobile,
    spotifyUser,
    selectedSongs,
    selectedAlbums,
    selectedPlaylists,
    selectedPlatform
}: TransferButtonProps) {
    const { state, updateState, resetState } = useTransferState()
    const { failureReport, showDownload, downloadReport, setFailureReport, setShowDownload } = useFailureReports()

    const totalSelected = selectedSongs.length + selectedAlbums.length + selectedPlaylists.length
    const canTransfer = spotifyUser && totalSelected > 0 && selectedPlatform

    const handleTransfer = async () => {
        if (!canTransfer) return

        updateState({ isTransferring: true, status: 'Preparing transfer...', progress: 0 })

        try {
            // Fetch data
            const data = await TransferService.fetchSpotifyData(
                selectedSongs,
                selectedAlbums,
                selectedPlaylists,
                (status) => updateState({ status })
            )

            // Transfer based on platform
            let result
            switch (selectedPlatform) {
                case 'TIDAL':
                    result = await TransferService.transferToTidal(data, (progress, status) => {
                        updateState({ progress, status })
                    })
                    break
                case 'BANDCAMP':
                    result = await TransferService.transferToBandcamp(data, (progress, status) => {
                        updateState({ progress, status })
                    })
                    break
                default:
                    throw new Error(`Platform ${selectedPlatform} not implemented`)
            }

            // Handle success
            updateState({ status: 'Transfer completed!', progress: 100 })

            setTimeout(() => {
                resetState()
            }, 3000)

        } catch (error) {
            console.error('Transfer failed:', error)
            updateState({ status: 'Transfer failed', isTransferring: false })
        }
    }

    const getStatusMessage = () => {
        if (!spotifyUser) return "Log in to Spotify first"
        if (totalSelected === 0) return "Select music to transfer"
        if (!selectedPlatform) return "Select a platform to transfer to"
        return `Ready: ${totalSelected} items → ${selectedPlatform}`
    }

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
            <TransferProgress
                isVisible={state.isTransferring}
                progress={state.progress}
                status={state.status}
            />

            <FailureReportButton
                failureReport={failureReport}
                showDownload={showDownload}
                onDownload={downloadReport}
            />

            <img
                src={canTransfer ? "/Buttons/Transfer.png" : "/Buttons/Transfer_Disabled.png"}
                alt="Transfer"
                onClick={handleTransfer}
                className={`
          ${isMobile ? 'w-[80%] h-[200px]' : 'w-[90%] h-auto'}
          ${canTransfer && !state.isTransferring
                        ? 'cursor-pointer hover:opacity-80 hover:scale-105 transition-all'
                        : 'cursor-not-allowed'
                    }
        `}
                title={getStatusMessage()}
            />

            {!state.isTransferring && (
                <div className="absolute bottom-8 left-0 right-0 text-center">
                    <p className={`text-xs font-mono ${canTransfer ? 'text-green-400' : 'text-yellow-400'}`}>
                        {getStatusMessage()}
                    </p>
                </div>
            )}
        </div>
    )
}