
// Component Props Types
export interface ComponentProps {
    isMobile: boolean
}

// Enhanced Spotify Data Types
export interface SpotifyTrack {
    id: string
    name: string
    artists: Array<{
        id: string
        name: string
    }>
    album: {
        id: string
        name: string
        images: Array<{
            url: string
            height: number
            width: number
        }>
        coverImage?: string
    }
    duration: number // in milliseconds
    explicit: boolean
    popularity: number
    previewUrl?: string
    spotifyUrl: string
    isrc?: string // International Standard Recording Code
    addedAt?: string
}

export interface SpotifyPlaylist {
    id: string
    name: string
    description?: string
    images: Array<{
        url: string
        height: number
        width: number
    }>
    coverImage?: string // Highest resolution cover
    trackCount: number
    isPublic: boolean
    collaborative: boolean
    owner: {
        id: string
        name: string
    }
    spotifyUrl: string
    tracks?: SpotifyTrack[] // Loaded separately
}

export interface SpotifyAlbum {
    id: string
    name: string
    artists: Array<{
        id: string
        name: string
    }>
    images: Array<{
        url: string
        height: number
        width: number
    }>
    coverImage?: string
    trackCount: number
    releaseDate: string
    genres: string[]
    spotifyUrl: string
    addedAt?: string
}

// Platform Types
export type StreamingPlatform =
    | 'APPLE_MUSIC'
    | 'SOUNDCLOUD'
    | 'TIDAL'
    | 'YOUTUBE_MUSIC'
    | 'BANDCAMP'

// Transfer Types
export interface TransferData {
    selectedTracks: SpotifyTrack[]
    selectedAlbums: SpotifyAlbum[]
    selectedPlaylists: SpotifyPlaylist[]
    targetPlatform: StreamingPlatform | null
}

export interface TransferStatus {
    isTransferring: boolean
    progress: number
    currentItem?: string
    error?: string
}