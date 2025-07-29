import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Spotify OAuth configuration - NO CLIENT SECRET NEEDED FOR PKCE
const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!
const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/callback` : 'http://localhost:3000/callback')

// Scopes we need for the app
const SCOPES = [
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read'
].join(' ')

// Generate a random state string for security
function generateRandomString(length: number): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

// Store state in sessionStorage for verification
function setState(state: string) {
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('spotify_auth_state', state)
    }
}

function getState(): string | null {
    if (typeof window !== 'undefined') {
        return sessionStorage.getItem('spotify_auth_state')
    }
    return null
}

// PKCE (Proof Key for Code Exchange) for security
async function generateCodeVerifier(): Promise<string> {
    const codeVerifier = generateRandomString(128)
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('code_verifier', codeVerifier)
    }
    return codeVerifier
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const base64String = btoa(String.fromCharCode(...new Uint8Array(digest)))
    return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Spotify Auth Class
export class SpotifyAuth {
    private api: SpotifyApi | null = null

    // Step 1: Redirect to Spotify login
    async redirectToSpotifyLogin(): Promise<void> {
        try {
            console.log('Starting Spotify login process...')
            console.log('CLIENT_ID:', CLIENT_ID)
            console.log('REDIRECT_URI:', REDIRECT_URI)

            if (!CLIENT_ID) {
                throw new Error('Spotify Client ID is not configured')
            }

            const state = generateRandomString(16)
            setState(state)

            const codeVerifier = await generateCodeVerifier()
            const codeChallenge = await generateCodeChallenge(codeVerifier)

            const params = new URLSearchParams({
                response_type: 'code',
                client_id: CLIENT_ID,
                scope: SCOPES,
                redirect_uri: REDIRECT_URI,
                state: state,
                code_challenge_method: 'S256',
                code_challenge: codeChallenge,
            })

            const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`
            console.log('Redirecting to:', authUrl)

            window.location.href = authUrl
        } catch (error) {
            console.error('Error in redirectToSpotifyLogin:', error)
            throw error
        }
    }

    // Step 2: Handle callback and exchange code for token (PKCE ONLY - NO CLIENT SECRET)
    async handleCallback(code: string, state: string): Promise<{
        id: string;
        name: string;
        email: string;
        image?: string;
        followers?: number;
    }> {
        console.log('=== SPOTIFY CALLBACK STARTED ===')

        // Verify state matches
        const storedState = getState()
        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack')
        }

        const codeVerifier = sessionStorage.getItem('code_verifier')
        if (!codeVerifier) {
            throw new Error('Code verifier not found - please try logging in again')
        }

        console.log('State and code verifier verified, exchanging code for token...')

        try {
            // Exchange authorization code for access token using PKCE
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    client_id: CLIENT_ID,
                    code_verifier: codeVerifier,
                }),
            })

            const responseText = await response.text()
            console.log('Token exchange response:', {
                status: response.status,
                statusText: response.statusText,
                bodyPreview: responseText.substring(0, 100) + '...'
            })

            if (!response.ok) {
                let errorDetails = responseText
                try {
                    const errorData = JSON.parse(responseText)
                    errorDetails = errorData.error_description || errorData.error || responseText
                } catch (e) {
                    // Use raw response if not JSON
                }
                throw new Error(`Token exchange failed (${response.status}): ${errorDetails}`)
            }

            const tokenData = JSON.parse(responseText)

            // Store tokens
            localStorage.setItem('spotify_access_token', tokenData.access_token)
            localStorage.setItem('spotify_refresh_token', tokenData.refresh_token)
            localStorage.setItem('spotify_token_expires',
                (Date.now() + tokenData.expires_in * 1000).toString()
            )

            console.log('Tokens stored successfully')

            // Clean up PKCE data
            sessionStorage.removeItem('spotify_auth_state')
            sessionStorage.removeItem('code_verifier')

            // Initialize Spotify API
            this.api = SpotifyApi.withAccessToken(CLIENT_ID, {
                access_token: tokenData.access_token,
                token_type: 'Bearer',
                expires_in: tokenData.expires_in,
                refresh_token: tokenData.refresh_token
            })

            // Get user profile
            const userProfile = await this.api.currentUser.profile()
            console.log('=== SPOTIFY LOGIN COMPLETE ===')

            return {
                id: userProfile.id,
                name: userProfile.display_name,
                email: userProfile.email,
                image: userProfile.images?.[0]?.url,
                followers: userProfile.followers?.total
            }

        } catch (error) {
            console.error('Spotify callback error:', error)
            this.logout() // Clear any partial state
            throw error
        }
    }

    // Check if user is already logged in
    async checkExistingLogin(): Promise<{
        id: string;
        name: string;
        email: string;
        image?: string;
        followers?: number;
    } | null> {
        const accessToken = localStorage.getItem('spotify_access_token')
        const refreshToken = localStorage.getItem('spotify_refresh_token')
        const expiresAt = localStorage.getItem('spotify_token_expires')

        console.log('Checking existing login:', {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            expiresAt,
            isExpired: expiresAt ? Date.now() > parseInt(expiresAt) : 'N/A'
        })

        if (!accessToken || !refreshToken) {
            console.log('Missing tokens, clearing storage')
            this.logout()
            return null
        }

        // Check if token is expired
        if (Date.now() > parseInt(expiresAt || '0')) {
            console.log('Token expired, attempting refresh...')
            try {
                await this.refreshToken()
                // After successful refresh, get new token
                const newAccessToken = localStorage.getItem('spotify_access_token')
                if (!newAccessToken) {
                    console.log('Refresh succeeded but no new token found')
                    this.logout()
                    return null
                }
            } catch (error) {
                console.error('Token refresh failed:', error)
                this.logout() // Clear invalid tokens
                return null
            }
        }

        // Initialize API with current token
        const currentAccessToken = localStorage.getItem('spotify_access_token')
        if (!currentAccessToken) {
            this.logout()
            return null
        }

        this.api = SpotifyApi.withAccessToken(CLIENT_ID, {
            access_token: currentAccessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: localStorage.getItem('spotify_refresh_token') || ''
        })

        try {
            const userProfile = await this.api.currentUser.profile()
            console.log('Successfully retrieved user profile:', userProfile.display_name)

            return {
                id: userProfile.id,
                name: userProfile.display_name,
                email: userProfile.email,
                image: userProfile.images?.[0]?.url,
                followers: userProfile.followers?.total
            }
        } catch (error) {
            console.error('Failed to get user profile, clearing tokens:', error)
            // Token might be invalid despite refresh, clear everything
            this.logout()
            return null
        }
    }

    // Refresh expired token (PKCE - NO CLIENT SECRET NEEDED)
    async refreshToken(): Promise<void> {
        const refreshToken = localStorage.getItem('spotify_refresh_token')
        if (!refreshToken) {
            throw new Error('No refresh token available')
        }

        console.log('Attempting to refresh Spotify token...')

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: CLIENT_ID,
                }),
            })

            const responseText = await response.text()
            console.log('Refresh token response:', {
                status: response.status,
                statusText: response.statusText,
                body: responseText.substring(0, 200) + '...'
            })

            if (!response.ok) {
                // Parse error if possible
                let errorDetails = responseText
                try {
                    const errorData = JSON.parse(responseText)
                    errorDetails = errorData.error_description || errorData.error || responseText
                } catch (e) {
                    // Use raw response if not JSON
                }

                throw new Error(`Refresh failed (${response.status}): ${errorDetails}`)
            }

            const tokenData = JSON.parse(responseText)

            // Update stored tokens
            localStorage.setItem('spotify_access_token', tokenData.access_token)
            localStorage.setItem('spotify_token_expires',
                (Date.now() + tokenData.expires_in * 1000).toString()
            )

            // Spotify sometimes sends a new refresh token
            if (tokenData.refresh_token) {
                localStorage.setItem('spotify_refresh_token', tokenData.refresh_token)
            }

            console.log('Token refresh successful')

        } catch (error) {
            console.error('Token refresh error:', error)
            throw error
        }
    }

    // Get user's playlists with full details (paginated)
    async getUserPlaylists(offset = 0, limit = 50): Promise<SpotifyPlaylist[]> {
        if (!this.api) {
            throw new Error('Not authenticated');
        }

        try {
            // This is the only API call you need.
            const response = await this.api.currentUser.playlists.playlists(50, offset);

            // Map the results directly without making more calls.
            const detailedPlaylists = response.items.map((playlist) => {
                // All the data is already in the 'playlist' object from the response.
                return {
                    id: playlist.id,
                    name: playlist.name,
                    description: playlist.description || null,
                    images: playlist.images,
                    coverImage: playlist.images?.[0]?.url || undefined,
                    trackCount: playlist.tracks?.total || 0,
                    isPublic: playlist.public,
                    collaborative: playlist.collaborative,
                    owner: {
                        id: playlist.owner.id,
                        display_name: playlist.owner.display_name || null
                    },
                    spotifyUrl: playlist.external_urls.spotify,
                };
            });

            return detailedPlaylists;

        } catch (error) {
            console.error('Error fetching playlists:', error);
            throw error;
        }
    }

    // Get all tracks from a specific playlist
    async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
        if (!this.api) {
            throw new Error('Not authenticated')
        }

        try {
            const tracks = []
            let offset = 0
            const limit = 50

            while (true) {
                const response = await this.api.playlists.getPlaylistItems(
                    playlistId,
                    'US',
                    undefined,
                    limit,
                    offset
                )

                const trackItems = response.items
                    .filter(item => item.track && item.track.type === 'track')
                    .map(item => ({
                        id: item.track.id,
                        name: item.track.name,
                        artists: item.track.artists.map(artist => ({
                            id: artist.id,
                            name: artist.name
                        })),
                        album: {
                            id: item.track.album.id,
                            name: item.track.album.name,
                            images: item.track.album.images,
                            coverImage: item.track.album.images?.[0]?.url
                        },
                        duration: item.track.duration_ms,
                        explicit: item.track.explicit,
                        popularity: item.track.popularity,
                        previewUrl: item.track.preview_url || null,
                        spotifyUrl: item.track.external_urls.spotify,
                        isrc: item.track.external_ids?.isrc || null,
                        addedAt: item.added_at,
                        addedBy: item.added_by
                    }))

                tracks.push(...trackItems)

                if (response.items.length < limit) {
                    break
                }
                offset += limit
            }

            return tracks
        } catch (error) {
            console.error(`Error fetching tracks for playlist ${playlistId}:`, error)
            throw error
        }
    }

    // Get user's saved albums (paginated)
    async getUserAlbums(offset = 0, limit = 50): Promise<SpotifyAlbum[]> {
        if (!this.api) {
            throw new Error('Not authenticated')
        }

        try {
            const response = await this.api.currentUser.albums.savedAlbums(50, offset, 'US')

            const albumItems = response.items.map(item => ({
                id: item.album.id,
                name: item.album.name,
                artists: item.album.artists.map(artist => ({
                    id: artist.id,
                    name: artist.name
                })),
                images: item.album.images,
                coverImage: item.album.images?.[0]?.url,
                trackCount: item.album.total_tracks,
                releaseDate: item.album.release_date,
                genres: item.album.genres,
                spotifyUrl: item.album.external_urls.spotify,
                addedAt: item.added_at
            }))

            return albumItems
        } catch (error) {
            console.error('Error fetching albums:', error)
            throw error
        }
    }

    // Get user's saved tracks (liked songs) (paginated)
    async getUserTracks(offset = 0, limit = 50): Promise<SpotifyTrack[]> {
        if (!this.api) {
            throw new Error('Not authenticated')
        }

        try {
            const response = await this.api.currentUser.tracks.savedTracks(50, offset, 'US')

            const trackItems = response.items.map(item => ({
                id: item.track.id,
                name: item.track.name,
                artists: item.track.artists.map(artist => ({
                    id: artist.id,
                    name: artist.name
                })),
                album: {
                    id: item.track.album.id,
                    name: item.track.album.name,
                    images: item.track.album.images,
                    coverImage: item.track.album.images?.[0]?.url
                },
                duration: item.track.duration_ms,
                explicit: item.track.explicit,
                popularity: item.track.popularity,
                previewUrl: item.track.preview_url || null,
                spotifyUrl: item.track.external_urls.spotify,
                isrc: item.track.external_ids?.isrc || null,
                addedAt: item.added_at
            }))

            return trackItems
        } catch (error) {
            console.error('Error fetching tracks:', error)
            throw error
        }
    }

    // NEW METHOD: Get tracks from a specific album
    async getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
        if (!this.api) {
            throw new Error('Not authenticated')
        }

        try {
            const album = await this.api.albums.get(albumId, 'US')

            // Get all tracks (handle pagination if album has more than 50 tracks)
            const tracks: SpotifyTrack[] = []
            let offset = 0
            const limit = 50

            while (offset < album.total_tracks) {
                const response = await this.api.albums.tracks(albumId, 'US', limit, offset)

                const trackBatch = response.items.map(track => ({
                    id: track.id,
                    name: track.name,
                    artists: track.artists.map(artist => ({
                        id: artist.id,
                        name: artist.name
                    })),
                    album: {
                        id: album.id,
                        name: album.name,
                        images: album.images,
                        coverImage: album.images?.[0]?.url
                    },
                    duration: track.duration_ms,
                    explicit: track.explicit,
                    popularity: album.popularity || 0, // Album popularity as fallback
                    previewUrl: track.preview_url || null,
                    spotifyUrl: track.external_urls.spotify,
                    isrc: undefined, // Simplified tracks don't include ISRC
                    addedAt: undefined,
                    addedBy: undefined,
                    // Additional track info
                    track_number: track.track_number,
                    disc_number: track.disc_number
                }))

                tracks.push(...trackBatch)

                if (response.items.length < limit) {
                    break
                }
                offset += limit
            }

            return tracks
        } catch (error) {
            console.error(`Error fetching tracks for album ${albumId}:`, error)
            throw error
        }
    }

    // Get current access token (useful for other API calls)
    getAccessToken(): string | null {
        return localStorage.getItem('spotify_access_token')
    }

    // Logout
    logout(): void {
        console.log('Logging out of Spotify...')
        localStorage.removeItem('spotify_access_token')
        localStorage.removeItem('spotify_refresh_token')
        localStorage.removeItem('spotify_token_expires')
        localStorage.removeItem('spotify_user') // Also clear stored user
        sessionStorage.removeItem('spotify_auth_state')
        sessionStorage.removeItem('code_verifier')
        this.api = null
    }
}

// Export singleton instance
export const spotifyAuth = new SpotifyAuth()