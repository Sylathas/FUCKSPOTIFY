// components/TidalDebugPanel.tsx
import { useState } from 'react'
import { tidalIntegration } from '@/lib/tidal'

export default function TidalDebugPanel() {
    const [debugOutput, setDebugOutput] = useState<string[]>([])
    const [isDebugging, setIsDebugging] = useState(false)

    // Override console.log to capture output
    const captureConsoleLog = (callback: () => Promise<void>) => {
        const logs: string[] = []
        const originalLog = console.log
        const originalError = console.error

        console.log = (...args) => {
            logs.push('[LOG] ' + args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' '))
            originalLog.apply(console, args)
        }

        console.error = (...args) => {
            logs.push('[ERROR] ' + args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' '))
            originalError.apply(console, args)
        }

        return callback().finally(() => {
            console.log = originalLog
            console.error = originalError
            setDebugOutput(logs)
        })
    }

    const runDebug = async () => {
        setIsDebugging(true)
        setDebugOutput(['Starting debug...'])

        try {
            if (!tidalIntegration.isAuthenticated()) {
                setDebugOutput(['Not authenticated. Please log in to Tidal first.'])
                return
            }

            await captureConsoleLog(async () => {
                // Add the debug method to your tidal integration if not already there
                if (typeof (tidalIntegration as any).debugAPI === 'function') {
                    await (tidalIntegration as any).debugAPI()
                } else {
                    console.error('Debug method not found. Add debugAPI() to your TidalIntegration class.')
                }
            })
        } catch (error) {
            console.error('Debug error:', error)
        } finally {
            setIsDebugging(false)
        }
    }

    const getCurl = async () => {
        try {
            if (typeof (tidalIntegration as any).getCurlCommand === 'function') {
                const curl = await (tidalIntegration as any).getCurlCommand()
                navigator.clipboard.writeText(curl)
                alert('Curl command copied to clipboard!')
            }
        } catch (error) {
            console.error('Error getting curl:', error)
        }
    }

    const testSimpleRequest = async () => {
        setDebugOutput(['Testing simple request...'])

        try {
            // Test with a simple GET request first
            const response = await fetch('https://openapi.tidal.com/v2', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('tidal_access_token')}`,
                }
            })

            setDebugOutput(prev => [...prev,
            `Response status: ${response.status}`,
            `Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`,
            `Response body: ${response.text()}`
            ])
        } catch (error) {
            setDebugOutput(prev => [...prev, `Error: ${error}`])
        }
    }

    return (
        <div className="fixed bottom-4 right-4 w-96 bg-black border-2 border-green-500 p-4 font-mono text-xs">
            <div className="text-green-500 mb-2">TIDAL DEBUG PANEL</div>

            <div className="space-y-2 mb-4">
                <button
                    onClick={runDebug}
                    disabled={isDebugging}
                    className="bg-green-500 text-black px-2 py-1 hover:bg-green-400 disabled:opacity-50 w-full"
                >
                    {isDebugging ? 'Running...' : 'Run Full Debug'}
                </button>

                <button
                    onClick={testSimpleRequest}
                    className="bg-blue-500 text-white px-2 py-1 hover:bg-blue-400 w-full"
                >
                    Test Simple Request
                </button>

                <button
                    onClick={getCurl}
                    className="bg-yellow-500 text-black px-2 py-1 hover:bg-yellow-400 w-full"
                >
                    Copy Curl Command
                </button>
            </div>

            <div className="bg-gray-900 p-2 h-64 overflow-y-auto text-green-400">
                {debugOutput.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap">{line}</div>
                ))}
            </div>

            <div className="mt-2 text-gray-400">
                Check browser console for full output
            </div>
        </div>
    )
}