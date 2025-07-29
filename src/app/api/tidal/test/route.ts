import { NextResponse } from 'next/server'

export async function GET() {
    const clientId = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID
    const clientSecret = process.env.TIDAL_CLIENT_SECRET

    return NextResponse.json({
        clientId: clientId ? 'Set' : 'Missing',
        clientIdValue: clientId || 'Not found',
        clientSecret: clientSecret ? 'Set' : 'Missing',
        clientSecretLength: clientSecret ? clientSecret.length : 0,
        allEnvKeys: Object.keys(process.env).filter(key =>
            key.includes('TIDAL') || key.includes('tidal')
        )
    })
}