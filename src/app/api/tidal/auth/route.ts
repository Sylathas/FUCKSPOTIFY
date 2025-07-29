// src/app/api/tidal/auth/route.ts

import { NextRequest, NextResponse } from 'next/server'

const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_CLIENT_SECRET = process.env.TIDAL_CLIENT_SECRET
const TIDAL_AUTH_BASE = 'https://auth.tidal.com'

export async function POST(request: NextRequest) {
    try {
        console.log('=== TIDAL AUTH API ROUTE CALLED ===')

        const { code, redirectUri } = await request.json()
        console.log('Received request:', {
            code: code ? 'Present' : 'Missing',
            redirectUri
        })

        if (!code || !redirectUri) {
            console.error('Missing required parameters')
            return NextResponse.json(
                { error: 'Missing code or redirectUri' },
                { status: 400 }
            )
        }

        // Check environment variables
        console.log('Environment check:', {
            clientId: TIDAL_CLIENT_ID ? 'Set' : 'Missing',
            clientSecret: TIDAL_CLIENT_SECRET ? 'Set' : 'Missing',
            clientIdValue: TIDAL_CLIENT_ID,
            clientSecretLength: TIDAL_CLIENT_SECRET ? TIDAL_CLIENT_SECRET.length : 0
        })

        if (!TIDAL_CLIENT_ID || !TIDAL_CLIENT_SECRET) {
            console.error('Missing Tidal credentials on server')
            return NextResponse.json(
                { error: 'Tidal credentials not configured on server' },
                { status: 500 }
            )
        }

        // Prepare credentials
        const credentials = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64')
        console.log('Credentials prepared, length:', credentials.length)

        const requestBody = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
        })

        console.log('Making request to Tidal with body:', requestBody.toString())

        // Exchange code for tokens using server-side credentials
        const tokenResponse = await fetch(`${TIDAL_AUTH_BASE}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`
            },
            body: requestBody,
        })

        console.log('Tidal API response status:', tokenResponse.status)
        console.log('Tidal API response headers:', Object.fromEntries(tokenResponse.headers.entries()))

        const responseText = await tokenResponse.text()
        console.log('Tidal API response body:', responseText)

        if (!tokenResponse.ok) {
            console.error('Tidal token exchange failed:', {
                status: tokenResponse.status,
                statusText: tokenResponse.statusText,
                body: responseText
            })
            return NextResponse.json(
                {
                    error: `Token exchange failed: ${tokenResponse.status}`,
                    details: responseText,
                    requestDetails: {
                        clientId: TIDAL_CLIENT_ID,
                        redirectUri,
                        bodyParams: requestBody.toString()
                    }
                },
                { status: tokenResponse.status }
            )
        }

        let tokenData
        try {
            tokenData = JSON.parse(responseText)
        } catch (parseError) {
            console.error('Failed to parse token response:', parseError)
            return NextResponse.json(
                { error: 'Invalid response from Tidal API', details: responseText },
                { status: 500 }
            )
        }

        console.log('Token exchange successful:', {
            hasAccessToken: !!tokenData.access_token,
            hasRefreshToken: !!tokenData.refresh_token,
            expiresIn: tokenData.expires_in
        })

        // Return tokens to client
        return NextResponse.json({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            scope: tokenData.scope
        })

    } catch (error) {
        console.error('Tidal auth API error:', error)

        // Handle unknown error type properly
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