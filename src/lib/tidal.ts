import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Tidal OAuth configuration
const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_REDIRECT_URI = process.env.NEXT_PUBLIC_TIDAL_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/tidal-callback` : 'http://localhost:3000/tidal-callback')

const TIDAL_API_BASE = 'https://openapi.tidal.com'
const TIDAL_AUTH_BASE = 'https://login.tidal.com'
const TIDAL_TOKEN_BASE = 'https://auth.tidal.com'

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

function generateCodeVerifier(): string {
    // Generate a random string of 128 characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
    let result = ''
    for (let i = 0; i < 128; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    // Create SHA256 hash of the code verifier
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)

    // Convert to base64url
    const hashArray = new Uint8Array(hashBuffer)
    const base64String = btoa(String.fromCharCode.apply(null, Array.from(hashArray)))

    // Convert base64 to base64url
    return base64String
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
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
        const codeVerifier = generateCodeVerifier()
        const codeChallenge = await generateCodeChallenge(codeVerifier)

        // Store state for verification
        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_auth_state', state)
            localStorage.setItem('tidal_code_verifier', codeVerifier)
            // Also store in sessionStorage as backup
            sessionStorage.setItem('tidal_auth_state', state)
            sessionStorage.setItem('tidal_code_verifier', codeVerifier)
        }

        console.log('TIDAL_REDIRECT_URI being used:', TIDAL_REDIRECT_URI);
        console.log('Code verifier length:', codeVerifier.length)
        console.log('Code challenge:', codeChallenge)


        const params = new URLSearchParams({
            response_type: 'code',
            client_id: TIDAL_CLIENT_ID,
            redirect_uri: TIDAL_REDIRECT_URI,
            scope: TIDAL_SCOPES,
            state: state,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge
        })

        const authUrl = `https://login.tidal.com/authorize?${params.toString()}`
        console.log('Redirecting to Tidal OAuth:', authUrl)

        window.location.href = authUrl
    }



    // Step 2: Handle OAuth callback
    async handleCallback(code: string, state: string): Promise<TidalUser> {
        console.log('=== TIDAL CALLBACK STARTED ===')
        console.log('Received parameters:', {
            code: code ? `${code.substring(0, 20)}...` : 'Missing',
            state: state || 'Missing'
        })

        // Verify state - try both localStorage and sessionStorage
        const storedStateLocal = typeof window !== 'undefined' ? localStorage.getItem('tidal_auth_state') : null
        const storedStateSession = typeof window !== 'undefined' ? sessionStorage.getItem('tidal_auth_state') : null
        const storedState = storedStateLocal || storedStateSession

        console.log('State verification:', {
            received: state,
            storedLocal: storedStateLocal,
            storedSession: storedStateSession,
            using: storedState,
            match: state === storedState
        })

        if (state !== storedState) {
            console.error('State mismatch:', { received: state, stored: storedState })
            throw new Error('State mismatch - possible CSRF attack')
        }

        // Get code verifier for PKCE - try both localStorage and sessionStorage
        const codeVerifierLocal = typeof window !== 'undefined' ? localStorage.getItem('tidal_code_verifier') : null
        const codeVerifierSession = typeof window !== 'undefined' ? sessionStorage.getItem('tidal_code_verifier') : null
        const codeVerifier = codeVerifierLocal || codeVerifierSession

        console.log('Code verifier check:', {
            foundLocal: !!codeVerifierLocal,
            foundSession: !!codeVerifierSession,
            using: codeVerifier ? 'found' : 'missing',
            length: codeVerifier?.length || 0,
            preview: codeVerifier ? `${codeVerifier.substring(0, 20)}...` : 'N/A'
        })

        if (!codeVerifier) {
            console.error('Code verifier not found in either storage')
            console.log('Available localStorage keys:',
                typeof window !== 'undefined' ? Object.keys(localStorage) : 'N/A'
            )
            console.log('Available sessionStorage keys:',
                typeof window !== 'undefined' ? Object.keys(sessionStorage) : 'N/A'
            )
            throw new Error('Code verifier not found - PKCE verification failed')
        }

        console.log('State and PKCE verified, calling API route...')

        // Use API route for token exchange
        const response = await fetch('/api/tidal/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                redirectUri: TIDAL_REDIRECT_URI,
                codeVerifier: codeVerifier,  // Include PKCE code verifier - THIS WAS MISSING!
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

        // Clean up stored PKCE data from both storages
        if (typeof window !== 'undefined') {
            localStorage.removeItem('tidal_auth_state')
            localStorage.removeItem('tidal_code_verifier')
            sessionStorage.removeItem('tidal_auth_state')
            sessionStorage.removeItem('tidal_code_verifier')
        }

        // Get user profile
        const userProfile = await this.getUserProfile()
        console.log('=== TIDAL LOGIN COMPLETE ===')

        return userProfile
    }

    // Get user profile from Tidal
    private async getUserProfile(): Promise<TidalUser> {
        console.log('=== GETTING TIDAL USER PROFILE ===')
        console.log('Access token available:', !!this.accessToken)
        console.log('Token preview:', this.accessToken ? `${this.accessToken.substring(0, 20)}...` : 'None')

        if (!this.accessToken) {
            throw new Error('No access token available')
        }

        try {
            // Use the correct endpoint with REQUIRED countryCode parameter
            const countryCode = 'US' // Default to US, should ideally get from user location
            const url = `${TIDAL_API_BASE}/v2/users/me?countryCode=${countryCode}`

            console.log('Making request to:', url)

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/vnd.tidal.v1+json',
                }
            })

            console.log('User profile response:', {
                status: response.status,
                statusText: response.statusText,
                url: response.url,
                headers: Object.fromEntries(response.headers.entries())
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('User profile request failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                    url: url
                })
                throw new Error(`Failed to get user profile: ${response.status} - ${errorText}`)
            }

            const data = await response.json()
            console.log('User profile data received:', data)

            // Parse the response structure according to Tidal API format
            const userData = data.data || data

            this.currentUser = {
                id: userData.id || userData.attributes?.id || 'unknown',
                username: userData.attributes?.username || userData.username || 'Unknown User',
                firstName: userData.attributes?.firstName || userData.firstName,
                lastName: userData.attributes?.lastName || userData.lastName,
                email: userData.attributes?.email || userData.email,
                countryCode: userData.attributes?.countryCode || userData.countryCode || countryCode,
            }

            console.log('Successfully parsed user data:', this.currentUser)

            // Store user data
            if (typeof window !== 'undefined') {
                localStorage.setItem('tidal_user', JSON.stringify(this.currentUser))
            }

            return this.currentUser

        } catch (error) {
            console.error('Error getting user profile:', error)
            throw error
        }
    }

    // Search for a track on Tidal
    async searchTrack(track: SpotifyTrack): Promise<string | null> {
        try {
            const query = `${track.artists.map(a => a.name).join(' ')} ${track.name}`
            const countryCode = this.currentUser?.countryCode || 'US'

            const url = `${TIDAL_API_BASE}/v2/searchresults/tracks?query=${encodeURIComponent(query)}&countryCode=${countryCode}&limit=5`

            console.log('Searching for track:', query, 'at URL:', url)

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/vnd.tidal.v1+json',
                }
            })

            if (!response.ok) {
                console.error('Track search failed:', response.status, response.statusText)
                return null
            }

            const data = await response.json()
            console.log('Track search response:', data)

            if (data.tracks?.items && data.tracks.items.length > 0) {
                const bestMatch = data.tracks.items[0]
                const trackId = bestMatch.resource?.id || bestMatch.id
                return `https://tidal.com/browse/track/${trackId}`
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
            const countryCode = this.currentUser?.countryCode || 'US'

            const url = `${TIDAL_API_BASE}/v2/searchresults/albums?query=${encodeURIComponent(query)}&countryCode=${countryCode}&limit=5`

            console.log('Searching for album:', query, 'at URL:', url)

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/vnd.tidal.v1+json',
                }
            })

            if (!response.ok) {
                console.error('Album search failed:', response.status, response.statusText)
                return null
            }

            const data = await response.json()
            console.log('Album search response:', data)

            if (data.albums?.items && data.albums.items.length > 0) {
                const bestMatch = data.albums.items[0]
                const albumId = bestMatch.resource?.id || bestMatch.id
                return `https://tidal.com/browse/album/${albumId}`
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
            const countryCode = this.currentUser?.countryCode || 'US'

            // Create the playlist with proper JSON structure from API docs
            const playlistData = {
                data: {
                    type: 'playlists',
                    attributes: {
                        title: playlist.name,
                        description: playlist.description || `Transferred from Spotify`,
                        accessType: 'PRIVATE'  // Based on API docs, use accessType instead of public
                    }
                }
            }

            console.log('Creating playlist with data:', playlistData)

            const createResponse = await fetch(`${TIDAL_API_BASE}/v2/playlists?countryCode=${countryCode}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/vnd.tidal.v1+json',
                    'Content-Type': 'application/vnd.tidal.v1+json'
                },
                body: JSON.stringify(playlistData)
            })

            console.log('Playlist creation response:', {
                status: createResponse.status,
                statusText: createResponse.statusText,
                url: createResponse.url
            })

            if (!createResponse.ok) {
                const errorText = await createResponse.text()
                console.error(`Failed to create playlist: ${createResponse.status} - ${errorText}`)
                return null
            }

            const createdPlaylist = await createResponse.json()
            console.log('Created playlist response:', createdPlaylist)

            const playlistId = createdPlaylist.data?.id
            if (!playlistId) {
                console.error('No playlist ID in response')
                return null
            }

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
        const countryCode = this.currentUser?.countryCode || 'US'

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

        if (tidalTrackIds.length === 0) {
            console.log('No tracks found to add to playlist')
            return
        }

        // Add tracks to playlist with proper JSON structure
        const tracksData = {
            data: tidalTrackIds.map(trackId => ({
                type: 'tracks',
                id: trackId
            }))
        }

        console.log('Adding tracks to playlist:', tracksData)

        const response = await fetch(`${TIDAL_API_BASE}/v2/playlists/${playlistId}/relationships/items?countryCode=${countryCode}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/vnd.tidal.v1+json',
                'Content-Type': 'application/vnd.tidal.v1+json'
            },
            body: JSON.stringify(tracksData)
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`Failed to add tracks to playlist: ${response.status} - ${errorText}`)
        } else {
            console.log(`Successfully added ${tidalTrackIds.length} tracks to playlist`)
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