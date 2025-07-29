// src/app/api/tidal/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { code } = await request.json();

        // We are NOT calling the Tidal API.
        // We are just checking if this function can run at all on Vercel
        // without returning a 403 error.
        console.log(`DEBUG: API Route was called successfully. Code received: ${code ? 'Yes' : 'No'}`);

        // Return a custom "teapot" error code.
        // If we see this 418 error in the browser console, it's a success!
        // It means the Vercel function ran and was not blocked.
        return NextResponse.json(
            { message: "DEBUGGING: Bypassed Tidal fetch. If you see this, the function is working." },
            { status: 418 } // Using "I'm a teapot" as a unique success indicator for our test
        );

    } catch (error) {
        console.error('DEBUG: The API route crashed.', error);
        return NextResponse.json(
            { error: 'DEBUG: The API route itself has an error.' },
            { status: 500 }
        );
    }
}