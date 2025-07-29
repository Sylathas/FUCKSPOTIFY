// src/app/api/tidal/auth/route.ts

import { NextRequest, NextResponse } from 'next/server'

const TIDAL_CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
const TIDAL_CLIENT_SECRET = process.env.TIDAL_CLIENT_SECRET
const TIDAL_AUTH_BASE = 'https://auth.tidal.com'

export async function POST(request: NextRequest) {
    try {
        const { code, redirectUri } = await request.json()

        if (!code || !redirectUri) {
            return NextResponse.json(
                { error: 'Missing code or redirectUri' },
                { status: 400 }
            )
        }

        if (!TIDAL_CLIENT_ID || !TIDAL_CLIENT_SECRET) {
            console.error('Missing Tidal credentials:', {
                clientId: TIDAL_CLIENT_ID ? 'Set' : 'Missing',
                clientSecret: TIDAL_CLIENT_SECRET ? 'Set' : 'Missing'
            })
            return NextResponse.json(
                { error: 'Tidal credentials not configured on server' },
                { status: 500 }
            )
        }

        // Exchange code for tokens using server-side credentials
        const credentials = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64')

        const tokenResponse = await fetch(`${TIDAL_AUTH_BASE}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
            }),
        })

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            console.error('Tidal token exchange failed:', {
                status: tokenResponse.status,
                statusText: tokenResponse.statusText,
                error: errorText
            })
            return NextResponse.json(
                { error: `Token exchange failed: ${tokenResponse.status}` },
                { status: tokenResponse.status }
            )
        }

        const tokenData = await tokenResponse.json()

        // Return tokens to client
        return NextResponse.json({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            scope: tokenData.scope
        })

    } catch (error) {
        console.error('Tidal auth API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}