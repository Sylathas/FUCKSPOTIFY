import { NextRequest, NextResponse } from 'next/server'

const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_CLIENT_SECRET = process.env.TIDAL_CLIENT_SECRET
const TIDAL_TOKEN_BASE = 'https://auth.tidal.com'  // Keep this for token endpoint

export async function POST(request: NextRequest) {
    try {
        console.log('=== TIDAL AUTH API ROUTE CALLED ===')

        const { code, redirectUri, codeVerifier } = await request.json()
        console.log('Received request:', {
            code: code ? 'Present' : 'Missing',
            redirectUri,
            codeVerifier: codeVerifier ? 'Present' : 'Missing'
        })

        if (!code || !redirectUri || !codeVerifier) {
            console.error('Missing required parameters')
            return NextResponse.json(
                { error: 'Missing code, redirectUri, or codeVerifier' },
                { status: 400 }
            )
        }

        // Check environment variables
        console.log('Environment check:', {
            clientId: TIDAL_CLIENT_ID ? 'Set' : 'Missing',
            clientSecret: TIDAL_CLIENT_SECRET ? 'Set' : 'Missing'
        })

        if (!TIDAL_CLIENT_ID || !TIDAL_CLIENT_SECRET) {
            console.error('Missing Tidal credentials on server')
            return NextResponse.json(
                { error: 'Tidal credentials not configured on server' },
                { status: 500 }
            )
        }

        const requestBody = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: TIDAL_CLIENT_ID,
            code: code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,  // PKCE requirement
        })

        console.log('Making request to Tidal with body:', requestBody.toString())

        // Exchange code for tokens - NOTE: Using client_id in body instead of Basic auth
        // This is different from the documentation but may be what Tidal actually expects
        const tokenResponse = await fetch(`${TIDAL_TOKEN_BASE}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // Try without Basic auth first, as some OAuth providers prefer client_id in body
            },
            body: requestBody,
        })

        console.log('Tidal API response status:', tokenResponse.status)

        const responseText = await tokenResponse.text()
        console.log('Tidal API response body:', responseText)

        if (!tokenResponse.ok) {
            console.error('Tidal token exchange failed:', {
                status: tokenResponse.status,
                statusText: tokenResponse.statusText,
                body: responseText
            })

            // If that didn't work, try with Basic auth as per documentation
            if (tokenResponse.status === 403 || tokenResponse.status === 401) {
                console.log('Retrying with Basic auth...')

                const credentials = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64')

                const retryResponse = await fetch(`${TIDAL_TOKEN_BASE}/v1/oauth2/token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${credentials}`
                    },
                    body: requestBody,
                })

                const retryText = await retryResponse.text()
                console.log('Retry response:', retryResponse.status, retryText)

                if (!retryResponse.ok) {
                    return NextResponse.json(
                        {
                            error: `Token exchange failed: ${retryResponse.status}`,
                            details: retryText,
                        },
                        { status: retryResponse.status }
                    )
                }

                const retryTokenData = JSON.parse(retryText)
                return NextResponse.json({
                    access_token: retryTokenData.access_token,
                    refresh_token: retryTokenData.refresh_token,
                    expires_in: retryTokenData.expires_in,
                    scope: retryTokenData.scope
                })
            }

            return NextResponse.json(
                {
                    error: `Token exchange failed: ${tokenResponse.status}`,
                    details: responseText,
                },
                { status: tokenResponse.status }
            )
        }

        const tokenData = JSON.parse(responseText)

        console.log('Token exchange successful:', {
            hasAccessToken: !!tokenData.access_token,
            hasRefreshToken: !!tokenData.refresh_token,
            expiresIn: tokenData.expires_in
        })

        return NextResponse.json({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            scope: tokenData.scope
        })

    } catch (error) {
        console.error('Tidal auth API error:', error)

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        const errorDetails = error instanceof Error ? error.stack : String(error)

        return NextResponse.json(
            {
                error: 'Internal server error',
                details: errorMessage,
                stack: errorDetails
            },
            { status: 500 }
        )
    }
}