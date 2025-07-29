import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

// Tidal OAuth configuration
const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_REDIRECT_URI = process.env.NEXT_PUBLIC_TIDAL_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/tidal-callback` : 'http://localhost:3000/tidal-callback')

const TIDAL_API_BASE = 'https://api.tidal.com'
const TIDAL_AUTH_BASE = 'https://login.tidal.com'
const TIDAL_TOKEN_BASE = 'https://openapi.tidal.com'

// Required scopes for playlist creation and management
const TIDAL_SCOPES = [
    'user.read',
    'collection.read',
    'collection.write',
    'playlists.read',
    'playlists.write'
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
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpires: number | null = null;
    private currentUser: TidalUser | null = null;

    // The API base for the official, documented API
    private apiBase = 'https://openapi.tidal.com';

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
        if (userData) this.currentUser = JSON.parse(userData);
    }

    private storeTokens(tokenData: any): void {
        if (typeof window === 'undefined') return;
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token || null;
        this.tokenExpires = Date.now() + (tokenData.expires_in * 1000);
        localStorage.setItem('tidal_access_token', this.accessToken || '');
        if (this.refreshToken) localStorage.setItem('tidal_refresh_token', this.refreshToken);
        localStorage.setItem('tidal_token_expires', this.tokenExpires.toString());
    }

    private clearTokens(): void {
        if (typeof window === 'undefined') return;
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpires = null;
        this.currentUser = null;
        localStorage.clear();
        sessionStorage.clear();
    }

    isAuthenticated(): boolean {
        return !!(this.accessToken && this.tokenExpires && Date.now() < this.tokenExpires);
    }

    getCurrentUser(): TidalUser | null {
        return this.currentUser;
    }

    async redirectToTidalLogin(): Promise<void> {
        if (!TIDAL_CLIENT_ID) throw new Error('Tidal Client ID not configured.');
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
        if (state !== storedState) throw new Error('State mismatch');
        const codeVerifier = typeof window !== 'undefined' ? localStorage.getItem('tidal_code_verifier') : null;
        if (!codeVerifier) throw new Error('Code verifier not found');

        const response = await fetch('/api/tidal/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirectUri: TIDAL_REDIRECT_URI, codeVerifier }),
        });
        if (!response.ok) throw new Error('Authentication failed');
        const tokenData = await response.json();
        this.storeTokens(tokenData);
        return this.getUserProfile();
    }

    private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
        if (!this.isAuthenticated()) throw new Error('User is not authenticated');
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/vnd.tidal.v1+json',
            'Content-Type': 'application/vnd.tidal.v1+json',
        };
        return fetch(url, { ...options, headers });
    }

    async getUserProfile(): Promise<TidalUser> {
        if (!this.accessToken) throw new Error('No access token');
        const payload = JSON.parse(atob(this.accessToken.split('.')[1]));
        const userId = payload.uid; // The User ID is in the 'uid' claim of the token
        if (!userId) throw new Error('Could not find user ID in token');

        const response = await this.fetchWithAuth(`${this.apiBase}/v1/users/${userId}?countryCode=US`);
        if (!response.ok) throw new Error('Failed to fetch user profile');

        const userData = await response.json();
        this.currentUser = {
            id: userData.id.toString(), username: userData.username, email: userData.email,
            countryCode: userData.countryCode, firstName: userData.firstName, lastName: userData.lastName,
        };
        if (typeof window !== 'undefined') localStorage.setItem('tidal_user', JSON.stringify(this.currentUser));
        return this.currentUser;
    }
    async searchTrack(track: SpotifyTrack): Promise<string | null> {
        const query = `${track.name} ${track.artists.map(a => a.name).join(' ')}`;
        const params = new URLSearchParams({ q: query, type: 'TRACK' });
        const response = await this.fetchWithAuth(`${this.apiBase}/v2/search?${params.toString()}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.data?.[0]?.id || null;
    }

    // NEW: The missing searchAlbum method
    async searchAlbum(album: SpotifyAlbum): Promise<string | null> {
        const query = `${album.name} ${album.artists.map(a => a.name).join(' ')}`;
        const params = new URLSearchParams({ q: query, type: 'ALBUM' });
        const response = await this.fetchWithAuth(`${this.apiBase}/v2/search?${params.toString()}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.data?.[0]?.id || null;
    }

    async createPlaylist(playlist: SpotifyPlaylist): Promise<string | null> {
        const body = {
            data: {
                type: 'playlists',
                attributes: {
                    name: playlist.name,
                    description: playlist.description || '',
                    accessType: 'PRIVATE',
                },
            },
        };
        const response = await this.fetchWithAuth(`${this.apiBase}/v2/playlists`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!response.ok) return null;
        const { data } = await response.json();
        return data.id;
    }

    async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<boolean> {
        const body = {
            data: trackIds.map(id => ({ type: 'tracks', id })),
        };
        const response = await this.fetchWithAuth(`${this.apiBase}/v2/playlists/${playlistId}/items`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        return response.ok;
    }

    // FINAL: The fully implemented transferToTidal function
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
        if (!this.isAuthenticated()) throw new Error('Not authenticated');

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
            const tidalId = await this.searchTrack(track);
            results.tracks.push({ original: track, tidalUrl: tidalId ? `https://tidal.com/browse/track/${tidalId}` : null });
            if (!tidalId) errors.push(`Track not found: ${track.name}`);
            updateProgress(`Searching for track: ${track.name}`);
            await new Promise(r => setTimeout(r, 250));
        }

        for (const album of selectedAlbums) {
            const tidalId = await this.searchAlbum(album);
            results.albums.push({ original: album, tidalUrl: tidalId ? `https://tidal.com/browse/album/${tidalId}` : null });
            if (!tidalId) errors.push(`Album not found: ${album.name}`);
            updateProgress(`Searching for album: ${album.name}`);
            await new Promise(r => setTimeout(r, 250));
        }

        for (const playlist of selectedPlaylists) {
            const newPlaylistId = await this.createPlaylist(playlist);
            if (newPlaylistId) {
                const trackIds: string[] = [];
                for (const track of playlist.tracks || []) {
                    const foundId = await this.searchTrack(track);
                    if (foundId) trackIds.push(foundId);
                    await new Promise(r => setTimeout(r, 250));
                }
                if (trackIds.length > 0) await this.addTracksToPlaylist(newPlaylistId, trackIds);
                results.playlists.push({ original: playlist, tidalUrl: `https://tidal.com/browse/playlist/${newPlaylistId}` });
            } else {
                errors.push(`Failed to create playlist: ${playlist.name}`);
                results.playlists.push({ original: playlist, tidalUrl: null });
            }
            updateProgress(`Processing playlist: ${playlist.name}`);
        }

        onProgress(100, 'Transfer complete!');
        return { success: errors.length === 0, results, errors };
    }

    logout(): void {
        this.clearTokens();
    }
}

// Export singleton instance
export const tidalIntegration = new TidalIntegration();