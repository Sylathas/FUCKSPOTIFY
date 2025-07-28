import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Spotify OAuth configuration
const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
// Use the current domain for redirect URI
const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3000/callback'

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

        window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`
    }

    // Step 2: Handle callback and exchange code for token
    async handleCallback(code: string, state: string): Promise<{
        id: string;
        name: string;
        email: string;
        image?: string;
        followers?: number;
    }> {
        // Verify state matches
        const storedState = getState()
        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack')
        }

        const codeVerifier = sessionStorage.getItem('code_verifier')
        if (!codeVerifier) {
            throw new Error('Code verifier not found')
        }

        // Exchange authorization code for access token
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

        if (!response.ok) {
            throw new Error('Failed to exchange code for token')
        }

        const tokenData = await response.json()

        // Store tokens
        localStorage.setItem('spotify_access_token', tokenData.access_token)
        localStorage.setItem('spotify_refresh_token', tokenData.refresh_token)
        localStorage.setItem('spotify_token_expires',
            (Date.now() + tokenData.expires_in * 1000).toString()
        )

        // Initialize Spotify API
        this.api = SpotifyApi.withAccessToken(CLIENT_ID, {
            access_token: tokenData.access_token,
            token_type: 'Bearer',
            expires_in: tokenData.expires_in,
            refresh_token: tokenData.refresh_token
        })

        // Get user profile
        const userProfile = await this.api.currentUser.profile()

        return {
            id: userProfile.id,
            name: userProfile.display_name,
            email: userProfile.email,
            image: userProfile.images?.[0]?.url,
            followers: userProfile.followers?.total
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
        const expiresAt = localStorage.getItem('spotify_token_expires')

        if (!accessToken || !expiresAt) {
            return null
        }

        // Check if token is expired
        if (Date.now() > parseInt(expiresAt)) {
            await this.refreshToken()
            return this.checkExistingLogin() // Retry after refresh
        }

        // Initialize API with existing token
        this.api = SpotifyApi.withAccessToken(CLIENT_ID, {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600, // Default 1 hour
            refresh_token: localStorage.getItem('spotify_refresh_token') || ''
        })

        try {
            const userProfile = await this.api.currentUser.profile()
            return {
                id: userProfile.id,
                name: userProfile.display_name,
                email: userProfile.email,
                image: userProfile.images?.[0]?.url,
                followers: userProfile.followers?.total
            }
        } catch (error) {
            // Token might be invalid, clear it
            this.logout()
            return null
        }
    }

    // Refresh expired token
    async refreshToken(): Promise<void> {
        const refreshToken = localStorage.getItem('spotify_refresh_token')
        if (!refreshToken) {
            throw new Error('No refresh token available')
        }

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

        if (!response.ok) {
            throw new Error('Failed to refresh token')
        }

        const tokenData = await response.json()

        // Update stored tokens
        localStorage.setItem('spotify_access_token', tokenData.access_token)
        localStorage.setItem('spotify_token_expires',
            (Date.now() + tokenData.expires_in * 1000).toString()
        )

        if (tokenData.refresh_token) {
            localStorage.setItem('spotify_refresh_token', tokenData.refresh_token)
        }
    }

    // Get user's playlists with full details
    async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
        if (!this.api) {
            throw new Error('Not authenticated')
        }

        try {
            // Get all user playlists (Spotify paginates results)
            const playlists = []
            let offset = 0
            const limit = 50

            while (true) {
                const response = await this.api.currentUser.playlists.playlists(limit, offset)
                playlists.push(...response.items)

                if (response.items.length < limit) {
                    break // No more playlists
                }
                offset += limit
            }

            // Get detailed information for each playlist
            const detailedPlaylists = await Promise.all(
                playlists.map(async (playlist) => {
                    try {
                        const fullPlaylist = await this.api!.playlists.getPlaylist(playlist.id)

                        return {
                            id: fullPlaylist.id,
                            name: fullPlaylist.name,
                            description: fullPlaylist.description || null,
                            images: fullPlaylist.images, // Array of cover images in different sizes
                            coverImage: fullPlaylist.images?.[0]?.url || undefined, // Highest resolution cover
                            trackCount: fullPlaylist.tracks.total,
                            isPublic: fullPlaylist.public,
                            collaborative: fullPlaylist.collaborative,
                            owner: {
                                id: fullPlaylist.owner.id,
                                name: fullPlaylist.owner.display_name || null
                            },
                            spotifyUrl: fullPlaylist.external_urls.spotify,
                            // We'll get tracks separately to avoid huge payloads
                        }
                    } catch (error) {
                        console.error(`Error fetching playlist ${playlist.id}:`, error)
                        return null
                    }
                })
            )

            return detailedPlaylists.filter(playlist => playlist !== null) as SpotifyPlaylist[]
        } catch (error) {
            console.error('Error fetching playlists:', error)
            throw error
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
                    'US', // Market
                    undefined, // Fields (all)
                    limit,
                    offset
                )

                // Filter out non-track items (podcasts, etc.) and extract track data
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
                        isrc: item.track.external_ids?.isrc || null, // International Standard Recording Code
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

    // Get user's saved albums
    async getUserAlbums(): Promise<SpotifyAlbum[]> {
        if (!this.api) {
            throw new Error('Not authenticated')
        }

        try {
            const albums = []
            let offset = 0
            const limit = 50

            while (true) {
                const response = await this.api.currentUser.albums.savedAlbums(limit, offset)

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

                albums.push(...albumItems)

                if (response.items.length < limit) {
                    break
                }
                offset += limit
            }

            return albums
        } catch (error) {
            console.error('Error fetching albums:', error)
            throw error
        }
    }

    // Get user's saved tracks (liked songs)
    async getUserTracks(): Promise<SpotifyTrack[]> {
        if (!this.api) {
            throw new Error('Not authenticated')
        }

        try {
            const tracks = []
            let offset = 0
            const limit = 50

            while (true) {
                const response = await this.api.currentUser.tracks.savedTracks(limit, offset)

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

                tracks.push(...trackItems)

                if (response.items.length < limit) {
                    break
                }
                offset += limit
            }

            return tracks
        } catch (error) {
            console.error('Error fetching tracks:', error)
            throw error
        }
    }

    // Logout
    logout(): void {
        localStorage.removeItem('spotify_access_token')
        localStorage.removeItem('spotify_refresh_token')
        localStorage.removeItem('spotify_token_expires')
        sessionStorage.removeItem('spotify_auth_state')
        sessionStorage.removeItem('code_verifier')
        this.api = null
    }
}

// Export singleton instance
export const spotifyAuth = new SpotifyAuth()