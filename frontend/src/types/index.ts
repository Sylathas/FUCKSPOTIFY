// Component Props Types
export interface ComponentProps {
    isMobile: boolean
}

// Enhanced Spotify Data Types - matching actual API responses
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
            height: number | null
            width: number | null
        }>
        coverImage?: string
    }
    duration: number // in milliseconds
    explicit: boolean
    popularity: number
    previewUrl?: string | null
    spotifyUrl: string
    isrc?: string | null // International Standard Recording Code
    addedAt?: string
    addedBy?: {
        id: string
        [key: string]: any
    }
}

export interface SpotifyPlaylist {
    id: string
    name: string
    description: string | null | undefined
    images: Array<{
        url: string
        height: number | null
        width: number | null
    }>
    coverImage: string | undefined // Highest resolution cover
    trackCount: number
    isPublic: boolean
    collaborative: boolean
    owner: {
        id: string
        display_name: string | null
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
        height: number | null
        width: number | null
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