import { NextRequest, NextResponse } from 'next/server';

// Use the new, server-side-only environment variable name
const TIDAL_CLIENT_ID = process.env.TIDAL_CLIENT_ID;
const TIDAL_TOKEN_URL = 'https://auth.tidal.com/token';

export async function POST(request: NextRequest) {
    try {
        const { code, redirectUri, codeVerifier } = await request.json();

        if (!code || !redirectUri || !codeVerifier) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            );
        }

        if (!TIDAL_CLIENT_ID) {
            console.error('TIDAL_CLIENT_ID is not configured on the server.');
            return NextResponse.json(
                { error: 'Server configuration error.' },
                { status: 500 }
            );
        }

        const requestBody = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: TIDAL_CLIENT_ID, // This now correctly uses the server-side variable
            code: code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        });

        const tokenResponse = await fetch(TIDAL_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: requestBody,
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error('Tidal token exchange failed:', tokenData);
            return NextResponse.json(
                {
                    error: `Token exchange failed: ${tokenResponse.status}`,
                    details: tokenData,
                },
                { status: tokenResponse.status }
            );
        }

        return NextResponse.json(tokenData);

    } catch (error) {
        console.error('Tidal auth API route error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return NextResponse.json(
            { error: 'Internal server error', details: errorMessage },
            { status: 500 }
        );
    }
}