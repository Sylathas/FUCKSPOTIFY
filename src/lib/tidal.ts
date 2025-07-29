import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Tidal OAuth configuration
const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_REDIRECT_URI = process.env.NEXT_PUBLIC_TIDAL_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/tidal-callback` : 'http://localhost:3000/tidal-callback')

const TIDAL_API_BASE = 'https://api.tidal.com'
const TIDAL_AUTH_BASE = 'https://login.tidal.com'
const TIDAL_TOKEN_BASE = 'https://auth.tidal.com'

// Required scopes for playlist creation and management
const TIDAL_SCOPES = 'user.read'


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
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpires: number | null = null;
    private currentUser: TidalUser | null = null;

    constructor() {
        this.loadStoredTokens();
    }

    // Load tokens from localStorage
    private loadStoredTokens(): void {
        if (typeof window === 'undefined') return;

        this.accessToken = localStorage.getItem('tidal_access_token');
        this.refreshToken = localStorage.getItem('tidal_refresh_token');
        const expires = localStorage.getItem('tidal_token_expires');
        this.tokenExpires = expires ? parseInt(expires) : null;

        const userData = localStorage.getItem('tidal_user');
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData);
            } catch (error) {
                console.error('Error parsing stored Tidal user data:', error);
            }
        }
    }

    // Store tokens in localStorage
    private storeTokens(tokenData: any): void {
        if (typeof window === 'undefined') return;

        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token || null;
        this.tokenExpires = Date.now() + (tokenData.expires_in * 1000);

        localStorage.setItem('tidal_access_token', this.accessToken || '');
        if (this.refreshToken) {
            localStorage.setItem('tidal_refresh_token', this.refreshToken);
        }
        localStorage.setItem('tidal_token_expires', this.tokenExpires.toString());
    }

    // Clear stored tokens
    private clearTokens(): void {
        if (typeof window === 'undefined') return;

        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpires = null;
        this.currentUser = null;

        localStorage.removeItem('tidal_access_token');
        localStorage.removeItem('tidal_refresh_token');
        localStorage.removeItem('tidal_token_expires');
        localStorage.removeItem('tidal_user');
        sessionStorage.removeItem('tidal_auth_state');
        sessionStorage.removeItem('tidal_code_verifier');
    }

    // Check if user is authenticated
    isAuthenticated(): boolean {
        return !!(this.accessToken && this.tokenExpires && Date.now() < this.tokenExpires);
    }

    // Get current user info
    getCurrentUser(): TidalUser | null {
        return this.currentUser;
    }

    // Step 1: Redirect to Tidal OAuth
    async redirectToTidalLogin(): Promise<void> {
        if (!TIDAL_CLIENT_ID) {
            throw new Error('Tidal Client ID is not configured.');
        }

        const state = generateRandomString(16);
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_auth_state', state);
            localStorage.setItem('tidal_code_verifier', codeVerifier);
            sessionStorage.setItem('tidal_auth_state', state);
            sessionStorage.setItem('tidal_code_verifier', codeVerifier);
        }

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: TIDAL_CLIENT_ID,
            redirect_uri: TIDAL_REDIRECT_URI,
            scope: TIDAL_SCOPES,
            state: state,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
        });

        const authUrl = `${TIDAL_AUTH_BASE}/authorize?${params.toString()}`;
        window.location.href = authUrl;
    }

    // Step 2: Handle OAuth callback
    async handleCallback(code: string, state: string): Promise<TidalUser> {
        const storedState = typeof window !== 'undefined' ? (localStorage.getItem('tidal_auth_state') || sessionStorage.getItem('tidal_auth_state')) : null;
        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack');
        }

        const codeVerifier = typeof window !== 'undefined' ? (localStorage.getItem('tidal_code_verifier') || sessionStorage.getItem('tidal_code_verifier')) : null;
        if (!codeVerifier) {
            throw new Error('Code verifier not found - PKCE verification failed');
        }

        const response = await fetch('/api/tidal/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirectUri: TIDAL_REDIRECT_URI, codeVerifier }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Authentication failed: ${errorData.error}`);
        }

        const tokenData = await response.json();
        this.storeTokens(tokenData);

        if (typeof window !== 'undefined') {
            localStorage.removeItem('tidal_auth_state');
            localStorage.removeItem('tidal_code_verifier');
            sessionStorage.removeItem('tidal_auth_state');
            sessionStorage.removeItem('tidal_code_verifier');
        }

        const userProfile = await this.getUserProfile();
        console.log('=== TIDAL LOGIN COMPLETE ===');
        return userProfile;
    }

    // Get user profile from Tidal
    private async getUserProfile(): Promise<TidalUser> {
        console.log('=== GETTING TIDAL USER PROFILE ===');
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            const payload = JSON.parse(atob(this.accessToken.split('.')[1]));
            const userId = payload.uid;
            if (!userId) {
                throw new Error('User ID (uid) not found in token payload.');
            }

            const url = `${TIDAL_API_BASE}/v1/users/${userId}?countryCode=${payload.countryCode || 'US'}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch user profile: ${response.status}`);
            }

            const userData = await response.json();
            this.currentUser = {
                id: userData.id.toString(),
                username: userData.username,
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                countryCode: userData.countryCode,
            };

            if (typeof window !== 'undefined') {
                localStorage.setItem('tidal_user', JSON.stringify(this.currentUser));
            }
            return this.currentUser;
        } catch (error) {
            console.error('Could not get user profile, creating fallback.', error);
            this.currentUser = { id: 'fallback-user', username: 'Tidal User', countryCode: 'US' };
            return this.currentUser;
        }
    }

    // Search for a track on Tidal and return its ID
    async searchTrack(track: SpotifyTrack): Promise<string | null> {
        if (!this.accessToken) return null;
        try {
            const query = `${track.name} ${track.artists.map(a => a.name).join(' ')}`;
            const params = new URLSearchParams({
                query,
                type: 'TRACKS',
                limit: '1',
                countryCode: this.currentUser?.countryCode || 'US',
            });

            const response = await fetch(`${TIDAL_API_BASE}/v1/search?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
            });

            if (!response.ok) return null;
            const data = await response.json();
            return data.tracks?.items?.[0]?.id.toString() || null;
        } catch (error) {
            console.error(`Error searching for track "${track.name}":`, error);
            return null;
        }
    }

    // Search for an album on Tidal and return its ID
    async searchAlbum(album: SpotifyAlbum): Promise<string | null> {
        if (!this.accessToken) return null;
        try {
            const query = `${album.name} ${album.artists.map(a => a.name).join(' ')}`;
            const params = new URLSearchParams({
                query,
                type: 'ALBUMS',
                limit: '1',
                countryCode: this.currentUser?.countryCode || 'US',
            });

            const response = await fetch(`${TIDAL_API_BASE}/v1/search?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
            });

            if (!response.ok) return null;
            const data = await response.json();
            return data.albums?.items?.[0]?.id.toString() || null;
        } catch (error) {
            console.error(`Error searching for album "${album.name}":`, error);
            return null;
        }
    }

    // Create a playlist and return its ID
    private async createPlaylist(playlist: SpotifyPlaylist): Promise<string | null> {
        if (!this.accessToken || !this.currentUser?.id) return null;
        try {
            const url = `${TIDAL_API_BASE}/v1/users/${this.currentUser.id}/playlists?countryCode=${this.currentUser.countryCode}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    title: playlist.name,
                    description: playlist.description || "Transferred from Spotify",
                }),
            });

            if (!response.ok) {
                console.error('Failed to create playlist:', await response.text());
                return null;
            }
            const createdPlaylist = await response.json();
            return createdPlaylist.uuid; // The ID is in the 'uuid' field
        } catch (error) {
            console.error(`Error creating playlist "${playlist.name}":`, error);
            return null;
        }
    }

    // Add a batch of tracks to a playlist
    private async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
        if (!this.accessToken || trackIds.length === 0) return;
        try {
            const url = `${TIDAL_API_BASE}/v1/playlists/${playlistId}/items?countryCode=${this.currentUser?.countryCode || 'US'}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    trackIds: trackIds.join(','),
                    onDupes: 'FAIL',
                }),
            });

            if (response.ok) {
                console.log(`✅ Successfully added ${trackIds.length} tracks to playlist ${playlistId}`);
            } else {
                console.error(`❌ Failed to add tracks to playlist ${playlistId}:`, await response.text());
            }
        } catch (error) {
            console.error('Error adding tracks to playlist:', error);
        }
    }

    // Main transfer function
    async transferToTidal(
        selectedTracks: SpotifyTrack[],
        selectedAlbums: SpotifyAlbum[],
        selectedPlaylists: SpotifyPlaylist[],
        onProgress: (progress: number, status: string) => void
    ): Promise<{
        success: boolean;
        results: {
            tracks: Array<{ original: SpotifyTrack; tidalUrl: string | null }>;
            albums: Array<{ original: SpotifyAlbum; tidalUrl: string | null }>;
            playlists: Array<{ original: SpotifyPlaylist; tidalUrl: string | null }>;
        };
        errors: string[];
    }> {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Tidal. Please log in first.');
        }

        const results: {
            tracks: Array<{ original: SpotifyTrack; tidalUrl: string | null }>;
            albums: Array<{ original: SpotifyAlbum; tidalUrl: string | null }>;
            playlists: Array<{ original: SpotifyPlaylist; tidalUrl: string | null }>;
        } = { tracks: [], albums: [], playlists: [] };
        const errors: string[] = [];
        const totalItems = selectedTracks.length + selectedAlbums.length + selectedPlaylists.length;
        let processedItems = 0;

        const updateProgress = (status: string) => {
            processedItems++;
            onProgress(Math.round((processedItems / totalItems) * 100), status);
        };

        onProgress(0, 'Starting Tidal transfer...');

        for (const track of selectedTracks) {
            const status = `Searching for track: ${track.name}`;
            try {
                const trackId = await this.searchTrack(track);
                const tidalUrl = trackId ? `https://tidal.com/browse/track/${trackId}` : null;
                results.tracks.push({ original: track, tidalUrl });
                if (!tidalUrl) errors.push(`Track not found: ${track.name}`);
            } catch (error) {
                errors.push(`Error processing track: ${track.name}`);
            }
            updateProgress(status);
            await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
        }

        for (const album of selectedAlbums) {
            const status = `Searching for album: ${album.name}`;
            try {
                const albumId = await this.searchAlbum(album);
                const tidalUrl = albumId ? `https://tidal.com/browse/album/${albumId}` : null;
                results.albums.push({ original: album, tidalUrl });
                if (!tidalUrl) errors.push(`Album not found: ${album.name}`);
            } catch (error) {
                errors.push(`Error processing album: ${album.name}`);
            }
            updateProgress(status);
            await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
        }

        for (const playlist of selectedPlaylists) {
            const status = `Creating playlist: ${playlist.name}`;
            try {
                const newPlaylistId = await this.createPlaylist(playlist);
                if (newPlaylistId) {
                    const tracksToFind = playlist.tracks || [];
                    const foundTrackIds: string[] = [];

                    for (const track of tracksToFind) {
                        const trackId = await this.searchTrack(track);
                        if (trackId) foundTrackIds.push(trackId);
                        await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
                    }

                    if (foundTrackIds.length > 0) {
                        // Add tracks in batches of 50
                        for (let i = 0; i < foundTrackIds.length; i += 50) {
                            const batch = foundTrackIds.slice(i, i + 50);
                            await this.addTracksToPlaylist(newPlaylistId, batch);
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting between batches
                        }
                    }
                    results.playlists.push({ original: playlist, tidalUrl: `https://tidal.com/browse/playlist/${newPlaylistId}` });
                } else {
                    errors.push(`Failed to create playlist: ${playlist.name}`);
                    results.playlists.push({ original: playlist, tidalUrl: null });
                }
            } catch (error) {
                errors.push(`Error processing playlist: ${playlist.name}`);
            }
            updateProgress(status);
        }

        onProgress(100, 'Transfer complete!');
        return { success: errors.length === 0, results, errors };
    }

    // Logout
    logout(): void {
        this.clearTokens();
    }
}

// Export singleton instance
export const tidalIntegration = new TidalIntegration();