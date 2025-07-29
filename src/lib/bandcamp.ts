import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist } from '@/types'

interface BandcampArtist {
    name: string
    directUrl: string
    searchUrl: string
    tracks: string[]
    albums: string[]
}

export class BandcampIntegration {

    // Generate unique artist list with their potential Bandcamp URLs
    private generateArtistList(
        tracks: SpotifyTrack[],
        albums: SpotifyAlbum[],
        playlists: SpotifyPlaylist[]
    ): BandcampArtist[] {
        const artistMap = new Map<string, BandcampArtist>()

        // Helper function to add artist
        const addArtist = (artistName: string, itemName: string, itemType: 'track' | 'album') => {
            const cleanName = artistName.trim()

            if (!artistMap.has(cleanName)) {
                const urlFriendlyName = cleanName
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
                    .replace(/\s+/g, '') // Remove spaces

                artistMap.set(cleanName, {
                    name: cleanName,
                    directUrl: `https://${urlFriendlyName}.bandcamp.com`,
                    searchUrl: `https://bandcamp.com/search?q=${encodeURIComponent(cleanName)}`,
                    tracks: [],
                    albums: []
                })
            }

            const artist = artistMap.get(cleanName)!
            if (itemType === 'track') {
                artist.tracks.push(itemName)
            } else {
                artist.albums.push(itemName)
            }
        }

        // Process tracks
        tracks.forEach(track => {
            track.artists.forEach(artist => {
                addArtist(artist.name, track.name, 'track')
            })
        })

        // Process albums
        albums.forEach(album => {
            album.artists.forEach(artist => {
                addArtist(artist.name, album.name, 'album')
            })
        })

        // Process playlists
        playlists.forEach(playlist => {
            playlist.tracks?.forEach(track => {
                track.artists.forEach(artist => {
                    addArtist(artist.name, track.name, 'track')
                })
            })
        })

        return Array.from(artistMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    }

    // Generate the text guide content
    private generateGuideContent(artists: BandcampArtist[], totalTracks: number, totalAlbums: number, totalPlaylists: number): string {
        const currentDate = new Date().toLocaleDateString()

        let content = `FUCK SPOTIFY - Bandcamp Transfer Guide
Generated on: ${currentDate}

This document will guide you through saving your music from Spotify on Bandcamp. Since the latter doesn't have a bespoke API and it's generally more of a marketplace rather than just a streaming platform, the process has to be mostly manual.

SUMMARY:
• ${totalTracks} tracks processed
• ${totalAlbums} albums processed  
• ${totalPlaylists} playlists processed
• ${artists.length} unique artists found

Underneath here you will find a list of direct links to the artists whose tracks/albums you have in your library and playlists. Please, wishlist, follow, buy, and support their music.

TIPS AND INFORMATION:
• All these links are automatically generated and might not be working. It could be because the artist has a different name on Bandcamp, or maybe they just don't have an account. This website and list is supposed to be a useful guide, but in no way it's a perfect one.

• If you can, buy music and merch on Bandcamp Fridays (first Friday of each month). During these days, artists get 100% of the profit without any fees.

• Try the direct links first - many artists use predictable URLs like "artistname.bandcamp.com"

• If the direct link doesn't work, use the search link to find the artist manually

• Consider following artists you like to discover their future releases

• Bandcamp often has exclusive releases, demos, and higher quality audio files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTISTS (${artists.length} total):

`

        artists.forEach((artist, index) => {
            const itemCount = artist.tracks.length + artist.albums.length
            content += `${index + 1}. ${artist.name} (${itemCount} item${itemCount !== 1 ? 's' : ''})
   Direct: ${artist.directUrl}
   Search: ${artist.searchUrl}

`
        })

        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BOOKMARKLET (Copy and save as a bookmark):
javascript:(function(){const wishBtn=document.querySelector('.wishlist-button:not(.wishlisted),[data-bind*="wishlist"]:not(.wishlisted)');if(wishBtn){wishBtn.click();const msg=document.createElement('div');msg.style.cssText='position:fixed;top:20px;right:20px;background:#00ff00;color:#000;padding:10px;border-radius:8px;z-index:9999;font-family:monospace;font-weight:bold;';msg.textContent='✅ Added to wishlist!';document.body.appendChild(msg);setTimeout(()=>msg.remove(),3000);}else{alert('No wishlist button found or already wishlisted!');}})();

HOW TO USE THE BOOKMARKLET:
1. Copy the long code above starting with "javascript:"
2. Create a new bookmark in your browser
3. Paste the code as the bookmark URL
4. When you're on any Bandcamp album page, click the bookmark to auto-wishlist

Generated by FuckSpotify - Transfer your music, support the artists!
`

        return content
    }

    // Main transfer function
    async transferToBandcamp(
        selectedTracks: SpotifyTrack[],
        selectedAlbums: SpotifyAlbum[],
        selectedPlaylists: SpotifyPlaylist[],
        onProgress: (progress: number, status: string) => void
    ): Promise<{
        success: boolean
        guideContent: string
        downloadOptions: {
            downloadTxt: () => void
            downloadPdf: () => void
        }
        stats: {
            totalArtists: number
            totalTracks: number
            totalAlbums: number
            totalPlaylists: number
        }
        errors: string[]
    }> {
        const errors: string[] = []

        onProgress(0, 'Processing your music library...')

        try {
            onProgress(25, 'Extracting unique artists...')

            // Generate artist list
            const artists = this.generateArtistList(selectedTracks, selectedAlbums, selectedPlaylists)

            onProgress(50, 'Generating transfer guide...')

            // Generate guide content
            const guideContent = this.generateGuideContent(
                artists,
                selectedTracks.length,
                selectedAlbums.length,
                selectedPlaylists.length
            )

            onProgress(75, 'Preparing download options...')

            // Create download functions
            const downloadTxt = () => {
                const blob = new Blob([guideContent], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `FuckSpotify-Bandcamp-Guide-${new Date().toISOString().split('T')[0]}.txt`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(url)
            }

            const downloadPdf = () => {
                // For PDF, we'll create a formatted HTML version and let the browser print to PDF
                const htmlContent = guideContent
                    .replace(/\n/g, '<br>')
                    .replace(/━/g, '─')
                    .replace(/•/g, '&bull;')

                const printWindow = window.open('', '_blank')
                if (printWindow) {
                    printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>FuckSpotify Bandcamp Guide</title>
                            <style>
                                body { 
                                    font-family: 'Courier New', monospace; 
                                    line-height: 1.4; 
                                    max-width: 800px; 
                                    margin: 20px auto; 
                                    padding: 20px;
                                    background: white;
                                    color: black;
                                }
                                @media print {
                                    body { margin: 0; padding: 10px; }
                                }
                            </style>
                        </head>
                        <body>
                            <pre style="white-space: pre-wrap; font-family: inherit;">${htmlContent}</pre>
                        </body>
                        </html>
                    `)
                    printWindow.document.close()

                    // Trigger print dialog after content loads
                    setTimeout(() => {
                        printWindow.print()
                    }, 500)
                }
            }

            onProgress(100, 'Bandcamp guide ready!')

            return {
                success: true,
                guideContent,
                downloadOptions: {
                    downloadTxt,
                    downloadPdf
                },
                stats: {
                    totalArtists: artists.length,
                    totalTracks: selectedTracks.length,
                    totalAlbums: selectedAlbums.length,
                    totalPlaylists: selectedPlaylists.length
                },
                errors
            }

        } catch (error) {
            errors.push(`Error generating guide: ${error instanceof Error ? error.message : 'Unknown error'}`)
            onProgress(100, 'Error generating guide')

            return {
                success: false,
                guideContent: '',
                downloadOptions: {
                    downloadTxt: () => { },
                    downloadPdf: () => { }
                },
                stats: {
                    totalArtists: 0,
                    totalTracks: 0,
                    totalAlbums: 0,
                    totalPlaylists: 0
                },
                errors
            }
        }
    }
}

export const bandcampIntegration = new BandcampIntegration()