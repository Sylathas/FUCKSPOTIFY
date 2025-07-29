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

        await this.discoverWorkingEndpoints()

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

        if (!this.accessToken) {
            throw new Error('No access token available')
        }

        const countryCode = 'US'

        // List of possible user profile endpoints to try
        const possibleEndpoints = [
            '/v2/me',
            '/v1/me',
            '/v2/user',
            '/v1/user',
            '/v2/profile',
            '/v1/profile',
            '/v2/account',
            '/v1/account',
            '/v2/users/current',
            '/v1/users/current',
            '/v2/currentUser',
            '/v1/currentUser'
        ]

        for (const endpoint of possibleEndpoints) {
            try {
                // Try both with and without countryCode parameter
                const urlsToTry = [
                    `${TIDAL_API_BASE}${endpoint}?countryCode=${countryCode}`,
                    `${TIDAL_API_BASE}${endpoint}`
                ]

                for (const url of urlsToTry) {
                    console.log(`Trying endpoint: ${endpoint} with URL: ${url}`)

                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`,
                            'Accept': 'application/vnd.tidal.v1+json',
                        }
                    })

                    console.log(`Response for ${url}:`, {
                        status: response.status,
                        statusText: response.statusText,
                    })

                    if (response.ok) {
                        const data = await response.json()
                        console.log(`SUCCESS with ${url}:`, data)

                        // Try to parse the response
                        const userData = data.data || data.user || data

                        this.currentUser = {
                            id: userData.id || userData.userId || userData.attributes?.id || 'unknown',
                            username: userData.username || userData.attributes?.username || userData.displayName || userData.name || 'Tidal User',
                            firstName: userData.firstName || userData.attributes?.firstName || userData.first_name,
                            lastName: userData.lastName || userData.attributes?.lastName || userData.last_name,
                            email: userData.email || userData.attributes?.email,
                            countryCode: userData.countryCode || userData.attributes?.countryCode || userData.country || countryCode,
                        }

                        console.log('Successfully parsed user from endpoint:', endpoint, this.currentUser)

                        // Store user data
                        if (typeof window !== 'undefined') {
                            localStorage.setItem('tidal_user', JSON.stringify(this.currentUser))
                        }

                        return this.currentUser
                    }

                    const errorText = await response.text()
                    console.log(`Endpoint ${url} failed:`, response.status, errorText)
                }

            } catch (error) {
                console.error(`Error with endpoint ${endpoint}:`, error)
                continue
            }
        }

        // If all endpoints fail, let's try to get user ID from token info or create minimal user
        console.log('All user profile endpoints failed. Attempting to decode token or create minimal user...')

        try {
            // Try to decode the JWT token to get user info
            const tokenParts = this.accessToken.split('.')
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]))
                console.log('Token payload:', payload)

                this.currentUser = {
                    id: payload.sub || payload.userId || payload.user_id || 'token-user',
                    username: payload.username || payload.name || 'Tidal User',
                    firstName: payload.firstName || payload.given_name,
                    lastName: payload.lastName || payload.family_name,
                    email: payload.email,
                    countryCode: payload.country || countryCode,
                }
            } else {
                // Create completely minimal user
                this.currentUser = {
                    id: 'minimal-user',
                    username: 'Tidal User',
                    firstName: undefined,
                    lastName: undefined,
                    email: undefined,
                    countryCode: countryCode,
                }
            }
        } catch (tokenError) {
            console.error('Could not decode token:', tokenError)

            // Final fallback - minimal user
            this.currentUser = {
                id: 'fallback-user',
                username: 'Tidal User',
                firstName: undefined,
                lastName: undefined,
                email: undefined,
                countryCode: countryCode,
            }
        }

        console.log('Created fallback user object:', this.currentUser)

        // Store minimal user data
        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_user', JSON.stringify(this.currentUser))
        }

        return this.currentUser
    }

    // Search for a track on Tidal
    async searchTrack(track: SpotifyTrack): Promise<string | null> {
        try {
            const query = `${track.artists.map(a => a.name).join(' ')} ${track.name}`
            const countryCode = this.currentUser?.countryCode || 'US'

            // Use the correct searchResults endpoint from API docs
            const searchId = encodeURIComponent(query)
            const url = `${TIDAL_API_BASE}/v2/searchResults/${searchId}?countryCode=${countryCode}&include=tracks&explicitFilter=include`

            console.log('Searching for track:', query, 'at URL:', url)

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/vnd.tidal.v1+json',
                }
            })

            console.log('Track search response:', response.status, response.statusText)

            if (!response.ok) {
                const errorText = await response.text()
                console.error('Track search failed:', response.status, errorText)
                return null
            }

            const data = await response.json()
            console.log('Track search response data:', data)

            // Parse the searchResults response structure
            if (data.tracks?.items && data.tracks.items.length > 0) {
                const bestMatch = data.tracks.items[0]
                const trackId = bestMatch.resource?.id || bestMatch.id
                if (trackId) {
                    console.log('Found track:', trackId)
                    return `https://tidal.com/browse/track/${trackId}`
                }
            }

            console.log('No tracks found for:', query)
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

            // Use the correct searchResults endpoint from API docs
            const searchId = encodeURIComponent(query)
            const url = `${TIDAL_API_BASE}/v2/searchResults/${searchId}?countryCode=${countryCode}&include=albums&explicitFilter=include`

            console.log('Searching for album:', query, 'at URL:', url)

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/vnd.tidal.v1+json',
                }
            })

            console.log('Album search response:', response.status, response.statusText)

            if (!response.ok) {
                const errorText = await response.text()
                console.error('Album search failed:', response.status, errorText)
                return null
            }

            const data = await response.json()
            console.log('Album search response data:', data)

            // Parse the searchResults response structure
            if (data.albums?.items && data.albums.items.length > 0) {
                const bestMatch = data.albums.items[0]
                const albumId = bestMatch.resource?.id || bestMatch.id
                if (albumId) {
                    console.log('Found album:', albumId)
                    return `https://tidal.com/browse/album/${albumId}`
                }
            }

            console.log('No albums found for:', query)
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

            // Use the exact format from API documentation
            const playlistData = {
                data: {
                    attributes: {
                        accessType: "PUBLIC",  // From API docs - can be PUBLIC or PRIVATE
                        description: playlist.description || "Transferred from Spotify",
                        name: playlist.name
                    },
                    type: "playlists"
                }
            }

            const url = `${TIDAL_API_BASE}/v2/playlists?countryCode=${countryCode}`

            console.log('Creating playlist with URL:', url)
            console.log('Playlist data:', JSON.stringify(playlistData, null, 2))

            const createResponse = await fetch(url, {
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
                console.error('No playlist ID in response:', createdPlaylist)
                return null
            }

            console.log('Playlist created successfully with ID:', playlistId)

            // Add tracks to the playlist if any exist (with rate limiting)
            if (tracks.length > 0) {
                console.log(`Adding ${tracks.length} tracks to playlist...`)
                await this.addTracksToPlaylistWithRateLimit(playlistId, tracks)
            }

            return `https://tidal.com/browse/playlist/${playlistId}`

        } catch (error) {
            console.error('Error creating Tidal playlist:', error)
            return null
        }
    }

    // Add tracks to a playlist
    private async addTracksToPlaylistWithRateLimit(playlistId: string, tracks: SpotifyTrack[]): Promise<void> {
        console.log(`Adding ${tracks.length} tracks to playlist ${playlistId}...`)

        // Process tracks in smaller batches to avoid rate limiting
        const batchSize = 3  // Reduced batch size to be more conservative
        const trackBatches = []

        for (let i = 0; i < tracks.length; i += batchSize) {
            trackBatches.push(tracks.slice(i, i + batchSize))
        }

        for (let batchIndex = 0; batchIndex < trackBatches.length; batchIndex++) {
            const batch = trackBatches[batchIndex]
            console.log(`Processing batch ${batchIndex + 1}/${trackBatches.length}...`)

            const tidalTrackIds: string[] = []

            // Search for tracks in this batch
            for (const track of batch) {
                try {
                    const trackUrl = await this.searchTrack(track)
                    if (trackUrl) {
                        const trackId = trackUrl.split('/track/')[1]
                        if (trackId) {
                            tidalTrackIds.push(trackId)
                            console.log(`Found track ${track.name} with ID: ${trackId}`)
                        }
                    } else {
                        console.log(`Track not found: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`)
                    }
                } catch (error) {
                    console.error(`Error searching for track ${track.name}:`, error)
                }

                // Delay between track searches to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500))
            }

            if (tidalTrackIds.length === 0) {
                console.log(`No tracks found in batch ${batchIndex + 1}`)
                continue
            }

            // Try to add this batch of tracks
            console.log(`Adding ${tidalTrackIds.length} tracks from batch ${batchIndex + 1}`)
            await this.addTrackBatchToPlaylist(playlistId, tidalTrackIds)

            // Delay between batches
            if (batchIndex < trackBatches.length - 1) {
                console.log('Waiting 2 seconds before next batch...')
                await new Promise(resolve => setTimeout(resolve, 2000))
            }
        }
    }

    private async addTrackBatchToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
        const countryCode = this.currentUser?.countryCode || 'US'

        // Based on the playlist creation pattern, try this structure
        const tracksData = {
            data: trackIds.map(trackId => ({
                type: 'tracks',
                id: trackId
            }))
        }

        // Try different endpoints for adding tracks to playlists
        const addTrackEndpoints = [
            `/v2/playlists/${playlistId}/items?countryCode=${countryCode}`,
            `/v2/playlists/${playlistId}/tracks?countryCode=${countryCode}`,
            `/v2/playlists/${playlistId}/relationships/items?countryCode=${countryCode}`,
            `/v1/playlists/${playlistId}/tracks?countryCode=${countryCode}`
        ]

        for (const endpoint of addTrackEndpoints) {
            try {
                const url = `${TIDAL_API_BASE}${endpoint}`
                console.log(`Trying to add ${trackIds.length} tracks with endpoint:`, url)
                console.log('Track data:', JSON.stringify(tracksData, null, 2))

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                        'Content-Type': 'application/vnd.tidal.v1+json'
                    },
                    body: JSON.stringify(tracksData)
                })

                console.log(`Add tracks response for ${endpoint}:`, response.status, response.statusText)

                if (response.ok) {
                    console.log(`✅ Successfully added ${trackIds.length} tracks with endpoint:`, endpoint)
                    return
                } else {
                    const errorText = await response.text()
                    console.log(`❌ Add tracks endpoint ${endpoint} failed:`, response.status, errorText)

                    if (response.status === 429) {
                        console.log('Rate limited, waiting 3 seconds...')
                        await new Promise(resolve => setTimeout(resolve, 3000))
                    }
                }

            } catch (error) {
                console.error(`Error with add tracks endpoint ${endpoint}:`, error)
                continue
            }
        }

        console.log(`⚠️  Failed to add tracks to playlist ${playlistId} with any endpoint`)
    }

    async discoverWorkingEndpoints(): Promise<void> {
        console.log('🚀 DISCOVERING WORKING TIDAL API ENDPOINTS...')

        if (!this.accessToken) {
            console.error('❌ No access token available for discovery')
            return
        }

        console.log('Access token available:', !!this.accessToken)
        console.log('Starting systematic endpoint discovery...')
        console.log('='.repeat(80))

        // Test endpoint helper
        const testEndpoint = async (endpoint: string, method: 'GET' | 'POST' = 'GET', body?: object) => {
            try {
                const options: RequestInit = {
                    method,
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/vnd.tidal.v1+json',
                    }
                }

                if (method === 'POST' && body) {
                    options.headers = {
                        ...options.headers,
                        'Content-Type': 'application/vnd.tidal.v1+json'
                    }
                    options.body = JSON.stringify(body)
                }

                const response = await fetch(`${TIDAL_API_BASE}${endpoint}`, options)
                const responseText = await response.text()

                let data = null
                try {
                    data = JSON.parse(responseText)
                } catch (e) {
                    data = responseText
                }

                return {
                    endpoint,
                    status: response.status,
                    success: response.ok,
                    data: response.ok ? data : undefined,
                    error: !response.ok ? responseText : undefined
                }
            } catch (error) {
                return {
                    endpoint,
                    status: 0,
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            }
        }

        // 1. DISCOVER SEARCH ENDPOINTS
        console.log('🔍 TESTING SEARCH ENDPOINTS...')
        const searchEndpoints = [
            '/v1/search?q=coldplay&countryCode=US',
            '/v2/search?q=coldplay&countryCode=US',
            '/v1/search?query=coldplay&countryCode=US',
            '/v2/search?query=coldplay&countryCode=US',
            '/v1/search?q=coldplay&type=tracks&countryCode=US',
            '/v2/search?q=coldplay&type=tracks&countryCode=US',
            '/v1/search/tracks?q=coldplay&countryCode=US',
            '/v2/search/tracks?q=coldplay&countryCode=US',
            '/v1/catalog/search?q=coldplay&countryCode=US',
            '/v2/catalog/search?q=coldplay&countryCode=US',
            '/v1/browse/search?q=coldplay&countryCode=US',
            '/v2/browse/search?q=coldplay&countryCode=US'
        ]

        for (const endpoint of searchEndpoints) {
            const result = await testEndpoint(endpoint)
            if (result.success) {
                console.log('✅ WORKING SEARCH:', endpoint)
                console.log('   Sample response keys:', Object.keys(result.data || {}))
                if (result.data?.tracks) {
                    console.log('   🎵 Has tracks data!')
                }
                if (result.data?.albums) {
                    console.log('   💿 Has albums data!')
                }
            } else if (result.status === 404) {
                console.log('❌ 404:', endpoint)
            } else if (result.status === 429) {
                console.log('⚠️  Rate limited:', endpoint)
                await new Promise(resolve => setTimeout(resolve, 2000))
            } else {
                console.log(`❌ ${result.status}:`, endpoint)
            }
            await new Promise(resolve => setTimeout(resolve, 300))
        }

        console.log('\n' + '='.repeat(80) + '\n')

        // 2. DISCOVER PLAYLIST ENDPOINTS
        console.log('🎵 TESTING PLAYLIST CREATION ENDPOINTS...')
        const playlistEndpoints = [
            '/v1/playlists?countryCode=US',
            '/v2/playlists?countryCode=US',
            '/v1/me/playlists?countryCode=US',
            '/v2/me/playlists?countryCode=US',
            '/v1/my/playlists?countryCode=US',
            '/v2/my/playlists?countryCode=US',
            '/v1/user/playlists?countryCode=US',
            '/v2/user/playlists?countryCode=US',
            '/v1/users/me/playlists?countryCode=US',
            '/v2/users/me/playlists?countryCode=US'
        ]

        const testPlaylistData = {
            data: {
                attributes: {
                    accessType: "PRIVATE",
                    description: "API Discovery Test",
                    name: "Test Playlist " + Date.now()
                },
                type: "playlists"
            }
        }

        for (const endpoint of playlistEndpoints) {
            const result = await testEndpoint(endpoint, 'POST', testPlaylistData)
            if (result.success) {
                console.log('✅ WORKING PLAYLIST CREATE:', endpoint)
                console.log('   Response:', result.data)
                console.log('   🎯 PLAYLIST CREATION WORKS!')
            } else if (result.status === 404) {
                console.log('❌ 404:', endpoint)
            } else if (result.status === 429) {
                console.log('⚠️  Rate limited:', endpoint)
                await new Promise(resolve => setTimeout(resolve, 2000))
            } else {
                console.log(`❌ ${result.status}:`, endpoint)
            }
            await new Promise(resolve => setTimeout(resolve, 500))
        }

        console.log('\n' + '='.repeat(80) + '\n')

        // 3. DISCOVER USER ENDPOINTS (that we haven't tried)
        console.log('👤 TESTING USER PROFILE ENDPOINTS...')
        const userEndpoints = [
            '/v1/me?countryCode=US',
            '/v2/me?countryCode=US',
            '/v1/user?countryCode=US',
            '/v2/user?countryCode=US',
            '/v1/profile?countryCode=US',
            '/v2/profile?countryCode=US',
            '/v1/account?countryCode=US',
            '/v2/account?countryCode=US',
            '/v1/me',
            '/v2/me',
            '/v1/user',
            '/v2/user'
        ]

        for (const endpoint of userEndpoints) {
            const result = await testEndpoint(endpoint)
            if (result.success) {
                console.log('✅ WORKING USER:', endpoint)
                console.log('   User data keys:', Object.keys(result.data || {}))
            } else if (result.status === 404) {
                console.log('❌ 404:', endpoint)
            } else if (result.status === 429) {
                console.log('⚠️  Rate limited:', endpoint)
                await new Promise(resolve => setTimeout(resolve, 2000))
            } else {
                console.log(`❌ ${result.status}:`, endpoint)
            }
            await new Promise(resolve => setTimeout(resolve, 300))
        }

        console.log('\n' + '='.repeat(80) + '\n')
        console.log('✅ ENDPOINT DISCOVERY COMPLETE!')
        console.log('Look for ✅ WORKING entries above to find functional endpoints')
        console.log('='.repeat(80))
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