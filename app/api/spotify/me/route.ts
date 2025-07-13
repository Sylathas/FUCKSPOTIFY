import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const accessToken = req.nextUrl.searchParams.get('token')
  if (!accessToken) return NextResponse.json({ error: 'No token' }, { status: 400 })

  // Get playlists
  const playlistsRes = await fetch('https://api.spotify.com/v1/me/playlists', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const playlistsData = await playlistsRes.json()

  // Get saved albums
  const albumsRes = await fetch('https://api.spotify.com/v1/me/albums', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const albumsData = await albumsRes.json()

  // Get saved tracks
  const tracksRes = await fetch('https://api.spotify.com/v1/me/tracks', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const tracksData = await tracksRes.json()

  return NextResponse.json({
    playlists: playlistsData.items,
    albums: albumsData.items,
    songs: tracksData.items
  })
}