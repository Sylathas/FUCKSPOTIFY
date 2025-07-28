// src/app/tidal-callback/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { tidalIntegration } from '@/lib/tidal'

function TidalCallbackContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const handleCallback = async () => {
            try {
                const code = searchParams.get('code')
                const state = searchParams.get('state')
                const error = searchParams.get('error')

                if (error) {
                    throw new Error(`Tidal OAuth error: ${error}`)
                }

                if (!code || !state) {
                    throw new Error('Missing authorization code or state parameter')
                }

                setStatus('loading')

                // Handle the OAuth callback
                const user = await tidalIntegration.handleCallback(code, state)

                console.log('Tidal login successful:', user)
                setStatus('success')

                // Redirect back to main app after a short delay
                setTimeout(() => {
                    router.push('/')
                }, 2000)

            } catch (error) {
                console.error('Tidal callback error:', error)
                setError(error instanceof Error ? error.message : 'Unknown error occurred')
                setStatus('error')
            }
        }

        handleCallback()
    }, [searchParams, router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-green-400 font-mono">
            <div className="text-center p-8">
                {status === 'loading' && (
                    <>
                        <div className="mb-4">
                            <div className="animate-spin h-8 w-8 border-2 border-green-400 border-t-transparent rounded-full mx-auto"></div>
                        </div>
                        <p>Connecting to Tidal...</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="mb-4 text-green-400">
                            <svg className="h-12 w-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <p className="text-xl mb-2">Tidal Login Successful!</p>
                        <p className="text-sm text-gray-400">Redirecting you back to the app...</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="mb-4 text-red-400">
                            <svg className="h-12 w-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <p className="text-xl mb-2 text-red-400">Login Failed</p>
                        <p className="text-sm text-gray-400 mb-4">{error}</p>
                        <button
                            onClick={() => router.push('/')}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                            Return to App
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

function LoadingFallback() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-green-400 font-mono">
            <div className="text-center p-8">
                <div className="mb-4">
                    <div className="animate-spin h-8 w-8 border-2 border-green-400 border-t-transparent rounded-full mx-auto"></div>
                </div>
                <p>Loading...</p>
            </div>
        </div>
    )
}

export default function TidalCallback() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <TidalCallbackContent />
        </Suspense>
    )
}