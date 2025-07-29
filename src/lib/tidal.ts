import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Tidal OAuth configuration
const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_REDIRECT_URI = process.env.NEXT_PUBLIC_TIDAL_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/tidal-callback` : 'http://localhost:3000/tidal-callback')

// Use v2 API endpoints
const TIDAL_API_BASE = 'https://openapi.tidal.com'
const TIDAL_AUTH_BASE = 'https://login.tidal.com'

// Required scopes for playlist creation and management
const TIDAL_SCOPES = [
    'playlists.read',
    'playlists.write',
    'collection.read',
    'collection.write',
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

interface TidalTrackResource {
    id: string
    type: 'tracks'
    attributes: {
        title: string
        duration: number
        trackNumber: number
        isrc: string
        artists: Array<{
            id: string
            name: string
        }>
        album: {
            id: string
            title: string
        }
    }
}

interface TidalPlaylistResource {
    id: string
    type: 'playlists'
    attributes: {
        name: string
        description?: string
        createdAt: string
        updatedAt: string
    }
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

// Add this helper function somewhere in your tidal.ts file
function parseJwt(token: string) {
    try {
        const base64Url = token.split('.')[1]; // Get the payload part
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(function (c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                })
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to parse JWT", e);
        return null;
    }
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
    private countryCode = 'US'; // Default country code

    constructor() {
        this.loadStoredTokens();
    }

    private loadStoredTokens(): void {
        if (typeof window === 'undefined') return;

        this.accessToken = localStorage.getItem('tidal_access_token');
        this.refreshToken = localStorage.getItem('tidal_refresh_token');

        const expires = localStorage.getItem('tidal_token_expires');
        this.tokenExpires = expires ? parseInt(expires) : null;

        const userData = localStorage.getItem('tidal_user');
        if (userData) {
            this.currentUser = JSON.parse(userData);
            this.countryCode = this.currentUser?.countryCode || 'US';
        }
    }

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
        localStorage.removeItem('tidal_auth_state');
        localStorage.removeItem('tidal_code_verifier');
    }

    isAuthenticated(): boolean {
        return !!(this.accessToken && this.tokenExpires && Date.now() < this.tokenExpires);
    }

    getCurrentUser(): TidalUser | null {
        return this.currentUser;
    }

    async redirectToTidalLogin(): Promise<void> {
        if (!TIDAL_CLIENT_ID) {
            throw new Error('Tidal Client ID not configured.');
        }

        const state = generateRandomString(16);
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_auth_state', state);
            localStorage.setItem('tidal_code_verifier', codeVerifier);
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

        window.location.href = `${TIDAL_AUTH_BASE}/authorize?${params.toString()}`;
    }

    async handleCallback(code: string, state: string): Promise<TidalUser> {
        const storedState = typeof window !== 'undefined' ? localStorage.getItem('tidal_auth_state') : null;

        if (state !== storedState) {
            throw new Error('State mismatch - possible CSRF attack');
        }

        const codeVerifier = typeof window !== 'undefined' ? localStorage.getItem('tidal_code_verifier') : null;
        if (!codeVerifier) {
            throw new Error('Code verifier not found');
        }

        // Exchange code for token
        const response = await fetch('/api/tidal/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirectUri: TIDAL_REDIRECT_URI, codeVerifier }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Authentication failed during token exchange:", errorText);
            throw new Error('Authentication failed');
        }

        const tokenData = await response.json();
        this.storeTokens(tokenData);

        // *** NEW LOGIC STARTS HERE ***

        // Decode the access token to get user info
        const tokenPayload = parseJwt(tokenData.access_token);
        if (!tokenPayload) {
            throw new Error("Failed to parse access token");
        }

        // The user ID is in the 'sub' (subject) claim of the token
        const userId = tokenPayload.sub;
        // The country code is often in a 'countryCode' claim
        const countryCode = tokenPayload.countryCode || 'US';

        this.countryCode = countryCode; // Update the instance's country code

        this.currentUser = {
            id: userId,
            username: tokenPayload.email || `Tidal User ${userId}`, // Use email or a fallback
            email: tokenPayload.email,
            countryCode: countryCode,
        };

        // Store the user data in localStorage
        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_user', JSON.stringify(this.currentUser));
            localStorage.removeItem('tidal_auth_state');
            localStorage.removeItem('tidal_code_verifier');
        }

        return this.currentUser;
    }

    private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
        if (!this.isAuthenticated()) {
            throw new Error('User is not authenticated');
        }

        // v2 API requires these specific headers
        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/vnd.tidal.v2+json',
            'Content-Type': 'application/vnd.tidal.v2+json',
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });

        // Log detailed error information for debugging
        if (!response.ok) {
            console.error(`Tidal API Error: ${response.status} ${response.statusText}`);
            console.error(`URL: ${url}`);
            try {
                const errorText = await response.text();
                console.error(`Response: ${errorText}`);
            } catch (e) {
                console.error('Could not read error response');
            }
        }

        return response;
    }

    async getUserProfile(): Promise<TidalUser> {
        // Get user profile using the v2 /me endpoint
        const response = await this.fetchWithAuth(
            `${TIDAL_API_BASE}/v2/me?countryCode=${this.countryCode}`
        );

        if (!response.ok) {
            console.error("Get user profile failed:", response.status);
            throw new Error('Failed to fetch user profile');
        }

        const responseData = await response.json();
        const userData = responseData.data;

        // Extract country code from the included session if available
        const session = responseData.included?.find((item: any) => item.type === 'sessions');
        if (session?.attributes?.countryCode) {
            this.countryCode = session.attributes.countryCode;
        }

        this.currentUser = {
            id: userData.id,
            username: userData.attributes?.email || userData.attributes?.username || 'Tidal User',
            email: userData.attributes?.email,
            firstName: userData.attributes?.firstName,
            lastName: userData.attributes?.lastName,
            countryCode: this.countryCode,
        };

        if (typeof window !== 'undefined') {
            localStorage.setItem('tidal_user', JSON.stringify(this.currentUser));
        }

        return this.currentUser;
    }

    async searchTrack(track: SpotifyTrack): Promise<string | null> {
        try {
            // Build search query - use exact track name and primary artist
            const artist = track.artists[0]?.name || '';
            const query = `${track.name} ${artist}`.trim();

            const params = new URLSearchParams({
                q: query,
                type: 'TRACK',
                limit: '10',
                offset: '0',
                countryCode: this.countryCode
            });

            const response = await this.fetchWithAuth(
                `${TIDAL_API_BASE}/v2/search?${params.toString()}`
            );

            if (!response.ok) {
                console.error(`Search failed for track: ${track.name}`);
                return null;
            }

            const data = await response.json();
            const tracks = data.data?.filter((item: any) => item.type === 'tracks') || [];

            if (tracks.length === 0) {
                console.log(`No results found for: ${track.name} by ${artist}`);
                return null;
            }

            // Find best match by comparing track name and artist
            const normalizeString = (str: string) => str.toLowerCase().replace(/[^\w\s]/gi, '');
            const trackNameNormalized = normalizeString(track.name);
            const artistNameNormalized = normalizeString(artist);

            const bestMatch = tracks.find((tidalTrack: TidalTrackResource) => {
                const tidalTrackName = normalizeString(tidalTrack.attributes.title);
                const tidalArtistName = normalizeString(tidalTrack.attributes.artists[0]?.name || '');

                return tidalTrackName === trackNameNormalized &&
                    tidalArtistName === artistNameNormalized;
            }) || tracks[0]; // Fall back to first result

            return bestMatch.id;

        } catch (error) {
            console.error('Error searching track:', error);
            return null;
        }
    }

    async createPlaylist(playlist: SpotifyPlaylist): Promise<string | null> {
        try {
            const body = {
                data: {
                    type: 'playlists',
                    attributes: {
                        name: playlist.name,
                        description: playlist.description || `Imported from Spotify: ${playlist.name}`,
                        // CORRECT: Use 'accessType' with string values
                        accessType: 'PRIVATE' // Or 'PUBLIC' if you want them to be public
                    }
                }
            };

            const response = await this.fetchWithAuth(
                `${TIDAL_API_BASE}/v2/playlists?countryCode=${this.countryCode}`,
                {
                    method: 'POST',
                    body: JSON.stringify(body),
                }
            );

            if (!response.ok) {
                console.error('Failed to create playlist:', playlist.name);
                return null;
            }

            const responseData = await response.json();
            return responseData.data?.id;

        } catch (error) {
            console.error('Error creating playlist:', error);
            return null;
        }
    }

    async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<boolean> {
        try {
            // v2 API expects tracks to be added with specific format
            const body = {
                data: trackIds.map((trackId, index) => ({
                    type: 'tracks',
                    id: trackId
                }))
            };

            const response = await this.fetchWithAuth(
                `${TIDAL_API_BASE}/v2/playlists/${playlistId}/items?countryCode=${this.countryCode}`,
                {
                    method: 'POST',
                    body: JSON.stringify(body),
                }
            );

            if (!response.ok) {
                console.error(`Failed to add tracks to playlist ${playlistId}`);

                // If batch fails, try adding tracks one by one (slower but more reliable)
                if (response.status === 400 || response.status === 422) {
                    console.log('Batch add failed, trying individual adds...');

                    for (const trackId of trackIds) {
                        const singleBody = {
                            data: {
                                type: 'tracks',
                                id: trackId
                            }
                        };

                        const singleResponse = await this.fetchWithAuth(
                            `${TIDAL_API_BASE}/v2/playlists/${playlistId}/items?countryCode=${this.countryCode}`,
                            {
                                method: 'POST',
                                body: JSON.stringify(singleBody),
                            }
                        );

                        if (!singleResponse.ok) {
                            console.error(`Failed to add track ${trackId} individually`);
                        }

                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    return true; // Return true even if some tracks failed
                }

                return false;
            }

            return true;

        } catch (error) {
            console.error('Error adding tracks to playlist:', error);
            return false;
        }
    }

    async transferToTidal(
        selectedPlaylists: SpotifyPlaylist[],
        onProgress?: (progress: { current: number; total: number; message: string }) => void
    ): Promise<{ success: number; failed: number; details: string[] }> {
        const results = {
            success: 0,
            failed: 0,
            details: [] as string[]
        };

        const totalPlaylists = selectedPlaylists.length;

        for (let playlistIndex = 0; playlistIndex < totalPlaylists; playlistIndex++) {
            const playlist = selectedPlaylists[playlistIndex];

            try {
                if (onProgress) {
                    onProgress({
                        current: playlistIndex,
                        total: totalPlaylists,
                        message: `Creating playlist: ${playlist.name}`
                    });
                }

                // Create the playlist
                const newPlaylistId = await this.createPlaylist(playlist);

                if (!newPlaylistId) {
                    results.failed++;
                    results.details.push(`Failed to create playlist: ${playlist.name}`);
                    continue;
                }

                // Search for tracks and collect IDs
                const trackIds: string[] = [];
                const tracks = playlist.tracks || [];

                for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
                    if (onProgress) {
                        onProgress({
                            current: playlistIndex,
                            total: totalPlaylists,
                            message: `Searching tracks for ${playlist.name}: ${trackIndex + 1}/${tracks.length}`
                        });
                    }

                    const tidalTrackId = await this.searchTrack(tracks[trackIndex]);
                    if (tidalTrackId) {
                        trackIds.push(tidalTrackId);
                    }

                    // Add a small delay to avoid rate limiting
                    if (trackIndex % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                // Add tracks to playlist
                if (trackIds.length > 0) {
                    const success = await this.addTracksToPlaylist(newPlaylistId, trackIds);

                    if (success) {
                        results.success++;
                        results.details.push(
                            `✓ ${playlist.name}: Added ${trackIds.length}/${tracks.length} tracks`
                        );
                    } else {
                        results.failed++;
                        results.details.push(
                            `✗ ${playlist.name}: Created but failed to add tracks`
                        );
                    }
                } else {
                    results.success++;
                    results.details.push(`✓ ${playlist.name}: Created (no matching tracks found)`);
                }

            } catch (error) {
                results.failed++;
                results.details.push(`✗ ${playlist.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        return results;
    }

    logout(): void {
        this.clearTokens();
    }
}

// Export singleton instance
export const tidalIntegration = new TidalIntegration();