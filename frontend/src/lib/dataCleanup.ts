/**
 * Data cleanup utilities for removing all stored user data
 * This ensures no user data persists in the browser
 */

export const clearAllUserData = (): void => {
    // Clear all localStorage data
    const keysToRemove = [
        'tidal_access_token',
        'tidal_login_poll_key',
        'tidal_login_started',
        'spotify_access_token',
        'spotify_refresh_token',
        'spotify_token_expires',
        'spotify_user',
        'spotify_user_client_id',
        'spotify_login_started',
        'spotify_login_timestamp'
    ];

    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
    });

    // Clear all sessionStorage data
    const sessionKeysToRemove = [
        'spotify_auth_state',
        'code_verifier'
    ];

    sessionKeysToRemove.forEach(key => {
        sessionStorage.removeItem(key);
    });

    console.log('🧹 All user data cleared from browser storage');
};

export const clearSpotifyData = (): void => {
    const spotifyKeys = [
        'spotify_access_token',
        'spotify_refresh_token',
        'spotify_token_expires',
        'spotify_user',
        'spotify_user_client_id',
        'spotify_login_started',
        'spotify_login_timestamp'
    ];

    spotifyKeys.forEach(key => {
        localStorage.removeItem(key);
    });

    sessionStorage.removeItem('spotify_auth_state');
    sessionStorage.removeItem('code_verifier');

    console.log('🧹 Spotify data cleared');
};

export const clearTidalData = (): void => {
    const tidalKeys = [
        'tidal_access_token',
        'tidal_login_poll_key',
        'tidal_login_started'
    ];

    tidalKeys.forEach(key => {
        localStorage.removeItem(key);
    });

    console.log('🧹 Tidal data cleared');
};

export const getStoredDataSummary = (): { localStorage: string[], sessionStorage: string[] } => {
    const localStorageKeys: string[] = [];
    const sessionStorageKeys: string[] = [];

    // Check localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('spotify') || key.includes('tidal'))) {
            localStorageKeys.push(key);
        }
    }

    // Check sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('spotify') || key.includes('tidal'))) {
            sessionStorageKeys.push(key);
        }
    }

    return {
        localStorage: localStorageKeys,
        sessionStorage: sessionStorageKeys
    };
};

