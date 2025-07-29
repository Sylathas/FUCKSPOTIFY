import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Tidal OAuth configuration
const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_REDIRECT_URI = process.env.NEXT_PUBLIC_TIDAL_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/tidal-callback` : 'http://localhost:3000/tidal-callback')

const TIDAL_API_BASE = 'https://openapi.tidal.com'
const TIDAL_AUTH_BASE = 'https://auth.tidal.com'

// Required scopes for playlist creation and management
const TIDAL_SCOPES = [
    'collection.read',
    'collection.write',
    'playlists.write',
    'user.read'
].join(' ')

interface TidalUser {
    id: string
    username: string
    firstName?: string
    lastName?: string
    email?: string
    countryCode: string
}

// Generate random string for OAuth state
function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

export class TidalIntegration {
    private accessToken: string | null = null
    private refreshToken: string | null = null
    private tokenExpires: number | null = null
    private currentUser: TidalUser | null = null

    constructor() {
        this.loadStoredTokens()
    }

    // Load tokens from localStorage
    private loadStoredTokens(): void {
        if (typeof window === 'undefined') return

        this.accessToken = localStorage.getItem('tidal_access_token')
        this.refreshToken = localStorage.getItem('tidal_refresh_token')
        const expires = localStorage.getItem('tidal_token_expires')
        this.tokenExpires = expires ? parseInt(expires) : null

        const userData = localStorage.getItem('tidal_user')
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData)
            } catch (error) {
                console.error('Error parsing stored Tidal user data:', error)
            }
        }
    }

    // Store tokens in localStorage
    private storeTokens(tokenData: any): void {
        if (typeof window === 'undefined') return

        this.accessToken = tokenData.access_token
        this.refreshToken = tokenData.refresh_token || null
        this.tokenExpires = Date.now() + (tokenData.expires_in * 1000)

        localStorage.setItem('tidal_access_token', this.accessToken || '')
        if (this.refreshToken) {
            localStorage.setItem('tidal_refresh_token', this.refreshToken)
        }
        localStorage.setItem('tidal_token_expires', this.tokenExpires.toString())
    }

    // Clear stored tokens
    private clearTokens(): void {
        if (typeof window === 'undefined') return

        this.accessToken = null
        this.refreshToken = null
        this.tokenExpires = null
        this.currentUser = null

        localStorage.removeItem('tidal_access_token')
        localStorage.removeItem('tidal_refresh_token')
        localStorage.removeItem('tidal_token_expires')
        localStorage.removeItem('tidal_user')
        sessionStorage.removeItem('tidal_auth_state')
    }

    // Check if user is authenticated
    isAuthenticated(): boolean {
        return !!(this.accessToken && this.tokenExpires && Date.now() < this.tokenExpires)
    }

    // Get current user info
    getCurrentUser(): TidalUser | null {
        return this.currentUser
    }

    // Step 1: Redirect to Tidal OAuth
    async redirectToTidalLogin(): Promise<void> {
        if (!TIDAL_CLIENT_ID) {
            throw new Error('Tidal Client ID is not configured.')
        }

        const state = generateRandomString(16)

        // Store state for verification
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('tidal_auth_state', state)
        }

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: TIDAL_CLIENT_ID,
            redirect_uri: TIDAL_REDIRECT_URI,
            scope: TIDAL_SCOPES,
            state: state,
        })

        const authUrl = `${TIDAL_AUTH_BASE}/v1/oauth2/authorize?${params.toString()}`
        console.log('Redirecting to Tidal OAuth:', authUrl)

        window.location.href = authUrl
    }

    // Step 2: Handle OAuth callback
    async handleCallback(code: string, state: string): Promise<TidalUser> {
        console.log('=== TIDAL CALLBACK STARTED ===')

        // Verify state
        const storedState = typeof window !== 'undefined' ? sessionStorage.getItem('tidal_auth_state') : null
        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack')
        }

        console.log('State verified, calling API route...')

        // Use API route for token exchange
        const response = await fetch('/api/tidal/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                redirectUri: TIDAL_REDIRECT_URI,
            }),
        })

        console.log('API route response status:', response.status)

        if (!response.ok) {
            const errorData = await response.json()
            console.error('API route failed:', errorData)
            throw new Error(`Authentication failed: ${errorData.error}`)
        }

        const tokenData = await response.json()
        console.log('Token received, storing...')

        this.storeTokens(tokenData)

        // Get user profile
        const userProfile = await this.getUserProfile()
        console.log('=== TIDAL LOGIN COMPLETE ===')

        return userProfile
    }

    // Get user profile from Tidal
    private async getUserProfile(): Promise<TidalUser> {
        const response = await fetch(`${TIDAL_API_BASE}/v2/me`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/vnd.tidal.v1+json',
            }
        })

        if (!response.ok) {
            throw new Error(`Failed to get user profile: ${response.status}`)
        }

        const data = await response.json()
        this.currentUser = {
            id: data.data.id,
            username: data.data.attributes.username,
            firstName: data.data.attributes.firstName,
            lastName: data.data.attributes.lastName,
            email: data.data.attributes.email,
            countryCode: data.data.attributes.countryCode,
        }

        // Store user data
        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_user', JSON.stringify(this.currentUser))
        }

        return this.currentUser
    }

    // Search for a track on Tidal
    async searchTrack(track: SpotifyTrack): Promise<string | null> {
        try {
            const query = `${track.artists.map(a => a.name).join(' ')} ${track.name}`

            const response = await fetch(
                `${TIDAL_API_BASE}/v2/searchresults/tracks?query=${encodeURIComponent(query)}&countryCode=${this.currentUser?.countryCode || 'US'}&limit=5`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                    }
                }
            )

            if (!response.ok) return null

            const data = await response.json()

            if (data.tracks?.items && data.tracks.items.length > 0) {
                const bestMatch = data.tracks.items[0]
                return `https://tidal.com/browse/track/${bestMatch.resource.id}`
            }

            return null
        } catch (error) {
            console.error('Error searching Tidal for track:', error)
            return null
        }
    }

    // Search for an album on Tidal
    async searchAlbum(album: SpotifyAlbum): Promise<string | null> {
        try {
            const query = `${album.artists.map(a => a.name).join(' ')} ${album.name}`

            const response = await fetch(
                `${TIDAL_API_BASE}/v2/searchresults/albums?query=${encodeURIComponent(query)}&countryCode=${this.currentUser?.countryCode || 'US'}&limit=5`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                    }
                }
            )

            if (!response.ok) return null

            const data = await response.json()

            if (data.albums?.items && data.albums.items.length > 0) {
                const bestMatch = data.albums.items[0]
                return `https://tidal.com/browse/album/${bestMatch.resource.id}`
            }

            return null
        } catch (error) {
            console.error('Error searching Tidal for album:', error)
            return null
        }
    }

    // Create a playlist on Tidal
    async createPlaylist(playlist: SpotifyPlaylist, tracks: SpotifyTrack[]): Promise<string | null> {
        try {
            // Create the playlist
            const playlistData = {
                data: {
                    type: 'playlists',
                    attributes: {
                        title: playlist.name,
                        description: playlist.description || `Transferred from Spotify`,
                        public: false
                    }
                }
            }

            const createResponse = await fetch(`${TIDAL_API_BASE}/v2/playlists`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/vnd.tidal.v1+json',
                    'Content-Type': 'application/vnd.tidal.v1+json'
                },
                body: JSON.stringify(playlistData)
            })

            if (!createResponse.ok) {
                console.error(`Failed to create playlist: ${createResponse.status}`)
                return null
            }

            const createdPlaylist = await createResponse.json()
            const playlistId = createdPlaylist.data.id

            // Add tracks to the playlist if any exist
            if (tracks.length > 0) {
                await this.addTracksToPlaylist(playlistId, tracks)
            }

            return `https://tidal.com/browse/playlist/${playlistId}`
        } catch (error) {
            console.error('Error creating Tidal playlist:', error)
            return null
        }
    }

    // Add tracks to a playlist
    private async addTracksToPlaylist(playlistId: string, tracks: SpotifyTrack[]): Promise<void> {
        const tidalTrackIds: string[] = []

        // Search for tracks on Tidal
        for (const track of tracks) {
            const trackUrl = await this.searchTrack(track)
            if (trackUrl) {
                const trackId = trackUrl.split('/track/')[1]
                if (trackId) {
                    tidalTrackIds.push(trackId)
                }
            }
            // Small delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        if (tidalTrackIds.length === 0) return

        // Add tracks to playlist
        const tracksData = {
            data: tidalTrackIds.map(trackId => ({
                type: 'tracks',
                id: trackId
            }))
        }

        await fetch(`${TIDAL_API_BASE}/v2/playlists/${playlistId}/relationships/items`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/vnd.tidal.v1+json',
                'Content-Type': 'application/vnd.tidal.v1+json'
            },
            body: JSON.stringify(tracksData)
        })
    }

    // Main transfer function
    async transferToTidal(
        selectedTracks: SpotifyTrack[],
        selectedAlbums: SpotifyAlbum[],
        selectedPlaylists: SpotifyPlaylist[],
        onProgress: (progress: number, status: string) => void
    ): Promise<{
        success: boolean
        results: {
            tracks: Array<{ original: SpotifyTrack, tidalUrl: string | null }>
            albums: Array<{ original: SpotifyAlbum, tidalUrl: string | null }>
            playlists: Array<{ original: SpotifyPlaylist, tidalUrl: string | null }>
        }
        errors: string[]
    }> {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Tidal. Please log in first.')
        }

        const results = {
            tracks: [] as Array<{ original: SpotifyTrack, tidalUrl: string | null }>,
            albums: [] as Array<{ original: SpotifyAlbum, tidalUrl: string | null }>,
            playlists: [] as Array<{ original: SpotifyPlaylist, tidalUrl: string | null }>
        }
        const errors: string[] = []

        const totalItems = selectedTracks.length + selectedAlbums.length + selectedPlaylists.length
        let processedItems = 0

        onProgress(0, 'Starting Tidal transfer...')

        // Transfer tracks
        for (const track of selectedTracks) {
            try {
                onProgress(
                    Math.round((processedItems / totalItems) * 100),
                    `Searching for: ${track.name}`
                )

                const tidalUrl = await this.searchTrack(track)
                results.tracks.push({ original: track, tidalUrl })

                if (!tidalUrl) {
                    errors.push(`Track not found: ${track.name}`)
                }
            } catch (error) {
                errors.push(`Error processing track: ${track.name}`)
            }
            processedItems++
        }

        // Transfer albums
        for (const album of selectedAlbums) {
            try {
                onProgress(
                    Math.round((processedItems / totalItems) * 100),
                    `Searching for: ${album.name}`
                )

                const tidalUrl = await this.searchAlbum(album)
                results.albums.push({ original: album, tidalUrl })

                if (!tidalUrl) {
                    errors.push(`Album not found: ${album.name}`)
                }
            } catch (error) {
                errors.push(`Error processing album: ${album.name}`)
            }
            processedItems++
        }

        // Transfer playlists
        for (const playlist of selectedPlaylists) {
            try {
                onProgress(
                    Math.round((processedItems / totalItems) * 100),
                    `Creating playlist: ${playlist.name}`
                )

                const playlistTracks = playlist.tracks || []
                const tidalUrl = await this.createPlaylist(playlist, playlistTracks)
                results.playlists.push({ original: playlist, tidalUrl })

                if (!tidalUrl) {
                    errors.push(`Failed to create playlist: ${playlist.name}`)
                }
            } catch (error) {
                errors.push(`Error processing playlist: ${playlist.name}`)
            }
            processedItems++
        }

        onProgress(100, 'Transfer complete!')

        return {
            success: errors.length === 0,
            results,
            errors
        }
    }

    // Logout
    logout(): void {
        this.clearTokens()
    }
}

// Export singleton instance
export const tidalIntegration = new TidalIntegration()