import { SpotifyApi } from "@spotify/web-api-ts-sdk";

export function getSpotifySdk(opts: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number; // ms timestamp
}) {
    return SpotifyApi.withAccessToken(process.env.SPOTIFY_CLIENT_ID!, {
        access_token: opts.accessToken,
        refresh_token: opts.refreshToken,
        token_type: "Bearer",
        expires_in: Math.max(0, Math.floor((opts.expiresAt - Date.now()) / 1000)),
    });
}