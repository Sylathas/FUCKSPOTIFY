import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Tidal OAuth configuration
const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_CLIENT_SECRET = process.env.TIDAL_CLIENT_SECRET
const TIDAL_REDIRECT_URI = process.env.NEXT_PUBLIC_TIDAL_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/tidal-callback` : 'http://localhost:3000/tidal-callback')

const TIDAL_API_BASE = 'https://openapi.tidal.com'
const TIDAL_AUTH_BASE = 'https://auth.tidal.com'

// Required scopes for playlist creation and management
const TIDAL_SCOPES = [
    'r_usr',     // Read user data
    'w_usr',     // Write user data  
    'w_sub',     // Write subscription data (playlists)
    'r_sub'      // Read subscription data
].join(' ')

interface TidalTokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token?: string
    scope: string
}

interface TidalUser {
    id: string
    username: string
    firstName?: string
    lastName?: string
    email?: string
    countryCode: string
    picture?: string
}

interface TidalSearchResult {
    tracks?: {
        items: Array<{
            resource: {
                id: string
                title: string
                artists: Array<{ name: string }>
                album: { title: string }
                isrc?: string
            }
        }>
    }
    albums?: {
        items: Array<{
            resource: {
                id: string
                title: string
                artists: Array<{ name: string }>
                numberOfTracks: number
            }
        }>
    }
}

interface TidalPlaylistCreateResponse {
    data: {
        id: string
        type: string
        attributes: {
            title: string
            description?: string
            public: boolean
        }
    }
}

// Utility functions for OAuth
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
        // Load existing tokens from localStorage
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
    private storeTokens(tokenData: TidalTokenResponse): void {
        if (typeof window === 'undefined') return

        this.accessToken = tokenData.access_token
        this.refreshToken = tokenData.refresh_token || null
        this.tokenExpires = Date.now() + (tokenData.expires_in * 1000)

        localStorage.setItem('tidal_access_token', this.accessToken)
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
            throw new Error('Tidal Client ID is not configured. Please add NEXT_PUBLIC_TIDAL_CLIENT_ID to your environment variables.')
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
        // Verify state
        const storedState = typeof window !== 'undefined' ? sessionStorage.getItem('tidal_auth_state') : null
        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack')
        }

        if (!TIDAL_CLIENT_ID || !TIDAL_CLIENT_SECRET) {
            throw new Error('Tidal credentials not configured')
        }

        // Exchange code for tokens
        const tokenResponse = await fetch(`${TIDAL_AUTH_BASE}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${btoa(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`)}`
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: TIDAL_REDIRECT_URI,
            }),
        })

        if (!tokenResponse.ok) {
            const error = await tokenResponse.text()
            throw new Error(`Failed to exchange code for token: ${error}`)
        }

        const tokenData: TidalTokenResponse = await tokenResponse.json()
        this.storeTokens(tokenData)

        // Get user profile
        const userProfile = await this.getUserProfile()

        return userProfile
    }

    // Get user profile from Tidal
    private async getUserProfile(): Promise<TidalUser> {
        await this.ensureValidToken()

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
            picture: data.data.attributes.picture
        }

        // Store user data
        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_user', JSON.stringify(this.currentUser))
        }

        return this.currentUser
    }

    // Ensure we have a valid access token
    private async ensureValidToken(): Promise<void> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with Tidal')
        }

        // Check if token is expired
        if (this.tokenExpires && Date.now() >= this.tokenExpires) {
            if (this.refreshToken) {
                await this.refreshAccessToken()
            } else {
                throw new Error('Token expired and no refresh token available')
            }
        }
    }

    // Refresh access token
    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken || !TIDAL_CLIENT_ID || !TIDAL_CLIENT_SECRET) {
            throw new Error('Cannot refresh token - missing credentials')
        }

        const response = await fetch(`${TIDAL_AUTH_BASE}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${btoa(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`)}`
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
            }),
        })

        if (!response.ok) {
            // Refresh failed, clear tokens and require re-login
            this.clearTokens()
            throw new Error('Token refresh failed - please log in again')
        }

        const tokenData: TidalTokenResponse = await response.json()
        this.storeTokens(tokenData)
    }

    // Search for a track on Tidal
    async searchTrack(track: SpotifyTrack): Promise<string | null> {
        try {
            await this.ensureValidToken()

            // Try ISRC search first (most accurate)
            if (track.isrc) {
                const isrcResult = await this.searchByISRC(track.isrc)
                if (isrcResult) return isrcResult
            }

            // Fallback to text search
            const query = `${track.artists.map(a => a.name).join(' ')} ${track.name}`
            console.log(`Searching Tidal for track: ${query}`)

            const response = await fetch(
                `${TIDAL_API_BASE}/v2/searchresults/tracks?query=${encodeURIComponent(query)}&countryCode=${this.currentUser?.countryCode || 'US'}&limit=10`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                    }
                }
            )

            if (!response.ok) {
                console.error(`Tidal track search failed: ${response.status}`)
                return null
            }

            const data: TidalSearchResult = await response.json()

            if (data.tracks?.items && data.tracks.items.length > 0) {
                // Find the best match
                const exactMatch = data.tracks.items.find(item => {
                    const tidalTrack = item.resource
                    return tidalTrack.title.toLowerCase() === track.name.toLowerCase() &&
                        tidalTrack.artists.some(artist =>
                            track.artists.some(spotifyArtist =>
                                artist.name.toLowerCase() === spotifyArtist.name.toLowerCase()
                            )
                        )
                })

                const bestMatch = exactMatch || data.tracks.items[0]
                return `https://tidal.com/browse/track/${bestMatch.resource.id}`
            }

            return null
        } catch (error) {
            console.error('Error searching Tidal for track:', track.name, error)
            return null
        }
    }

    // Search by ISRC
    private async searchByISRC(isrc: string): Promise<string | null> {
        try {
            const response = await fetch(
                `${TIDAL_API_BASE}/v2/searchresults/tracks?query=isrc:${isrc}&countryCode=${this.currentUser?.countryCode || 'US'}&limit=1`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                    }
                }
            )

            if (response.ok) {
                const data: TidalSearchResult = await response.json()
                if (data.tracks?.items && data.tracks.items.length > 0) {
                    return `https://tidal.com/browse/track/${data.tracks.items[0].resource.id}`
                }
            }
        } catch (error) {
            console.error('Error searching by ISRC:', error)
        }

        return null
    }

    // Search for an album on Tidal
    async searchAlbum(album: SpotifyAlbum): Promise<string | null> {
        try {
            await this.ensureValidToken()

            const query = `${album.artists.map(a => a.name).join(' ')} ${album.name}`
            console.log(`Searching Tidal for album: ${query}`)

            const response = await fetch(
                `${TIDAL_API_BASE}/v2/searchresults/albums?query=${encodeURIComponent(query)}&countryCode=${this.currentUser?.countryCode || 'US'}&limit=10`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                    }
                }
            )

            if (!response.ok) {
                console.error(`Tidal album search failed: ${response.status}`)
                return null
            }

            const data: TidalSearchResult = await response.json()

            if (data.albums?.items && data.albums.items.length > 0) {
                const exactMatch = data.albums.items.find(item => {
                    const tidalAlbum = item.resource
                    return tidalAlbum.title.toLowerCase() === album.name.toLowerCase() &&
                        tidalAlbum.artists.some(artist =>
                            album.artists.some(spotifyArtist =>
                                artist.name.toLowerCase() === spotifyArtist.name.toLowerCase()
                            )
                        )
                })

                const bestMatch = exactMatch || data.albums.items[0]
                return `https://tidal.com/browse/album/${bestMatch.resource.id}`
            }

            return null
        } catch (error) {
            console.error('Error searching Tidal for album:', album.name, error)
            return null
        }
    }

    // Create a playlist on Tidal
    async createPlaylist(playlist: SpotifyPlaylist, tracks: SpotifyTrack[]): Promise<string | null> {
        try {
            await this.ensureValidToken()

            console.log(`Creating Tidal playlist: ${playlist.name}`)

            // Create the playlist
            const playlistData = {
                data: {
                    type: 'playlists',
                    attributes: {
                        title: playlist.name,
                        description: playlist.description || `Transferred from Spotify: ${playlist.name}`,
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
                const errorText = await createResponse.text()
                console.error(`Failed to create playlist: ${createResponse.status} - ${errorText}`)
                return null
            }

            const createdPlaylist: TidalPlaylistCreateResponse = await createResponse.json()
            const playlistId = createdPlaylist.data.id

            console.log(`Created playlist with ID: ${playlistId}`)

            // Add tracks to the playlist if any exist
            if (tracks.length > 0) {
                await this.addTracksToPlaylist(playlistId, tracks)
            }

            return `https://tidal.com/browse/playlist/${playlistId}`
        } catch (error) {
            console.error('Error creating Tidal playlist:', playlist.name, error)
            return null
        }
    }

    // Add tracks to a playlist
    private async addTracksToPlaylist(playlistId: string, tracks: SpotifyTrack[]): Promise<boolean> {
        try {
            console.log(`Adding ${tracks.length} tracks to playlist ${playlistId}`)

            // Search for tracks on Tidal and collect track IDs
            const tidalTrackIds: string[] = []

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

            if (tidalTrackIds.length === 0) {
                console.log('No tracks found on Tidal to add to playlist')
                return false
            }

            console.log(`Found ${tidalTrackIds.length} tracks on Tidal out of ${tracks.length} requested`)

            // Add tracks to playlist
            const tracksData = {
                data: tidalTrackIds.map(trackId => ({
                    type: 'tracks',
                    id: trackId
                }))
            }

            const addResponse = await fetch(
                `${TIDAL_API_BASE}/v2/playlists/${playlistId}/relationships/items`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                        'Content-Type': 'application/vnd.tidal.v1+json'
                    },
                    body: JSON.stringify(tracksData)
                }
            )

            if (!addResponse.ok) {
                const errorText = await addResponse.text()
                console.error(`Failed to add tracks to playlist: ${addResponse.status} - ${errorText}`)
                return false
            }

            console.log(`Successfully added ${tidalTrackIds.length} tracks to playlist`)
            return true
        } catch (error) {
            console.error('Error adding tracks to playlist:', error)
            return false
        }
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
                    `Searching for track: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`
                )

                const tidalUrl = await this.searchTrack(track)
                results.tracks.push({ original: track, tidalUrl })

                if (!tidalUrl) {
                    errors.push(`Could not find track on Tidal: ${track.artists.map(a => a.name).join(', ')} - ${track.name}`)
                }

                await new Promise(resolve => setTimeout(resolve, 100))
            } catch (error) {
                errors.push(`Error processing track: ${track.name} - ${error}`)
            }

            processedItems++
        }

        // Transfer albums
        for (const album of selectedAlbums) {
            try {
                onProgress(
                    Math.round((processedItems / totalItems) * 100),
                    `Searching for album: ${album.name} by ${album.artists.map(a => a.name).join(', ')}`
                )

                const tidalUrl = await this.searchAlbum(album)
                results.albums.push({ original: album, tidalUrl })

                if (!tidalUrl) {
                    errors.push(`Could not find album on Tidal: ${album.artists.map(a => a.name).join(', ')} - ${album.name}`)
                }

                await new Promise(resolve => setTimeout(resolve, 100))
            } catch (error) {
                errors.push(`Error processing album: ${album.name} - ${error}`)
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
                    errors.push(`Could not create playlist on Tidal: ${playlist.name}`)
                }
            } catch (error) {
                errors.push(`Error processing playlist: ${playlist.name} - ${error}`)
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