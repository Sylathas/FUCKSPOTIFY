import yaml
import asyncio
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import tidalapi

# Import library functions
from auth import open_tidal_session
from sync import sync_playlist, tidal_search

# --- Pydantic Models (These are correct and remain the same) ---
class SpotifyImage(BaseModel):
    url: str
    height: Optional[int] = None
    width: Optional[int] = None

class SpotifyOwner(BaseModel):
    id: str
    display_name: Optional[str] = None

class SpotifyArtist(BaseModel):
    id: str
    name: str

class SpotifyAlbumInfo(BaseModel):
    id: str
    name: str

class SpotifyTrack(BaseModel):
    id: str
    name: str
    artists: List[SpotifyArtist]
    album: SpotifyAlbumInfo
    duration: int
    isrc: Optional[str] = None

class SpotifyPlaylist(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    tracks: Optional[List[SpotifyTrack]] = []

class SpotifyAlbum(BaseModel):
    id: str
    name: str
    artists: List[SpotifyArtist]

class LikeSongsRequest(BaseModel):
    tracks: List[SpotifyTrack]

class AddAlbumsRequest(BaseModel):
    albums: List[SpotifyAlbum]

class TransferPlaylistRequest(BaseModel):
    playlists: List[SpotifyPlaylist]


# --- FastAPI App ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CORRECTED ENDPOINTS ---

@app.post("/api/like/songs")
async def like_songs_on_tidal(request: LikeSongsRequest):
    print(f"Received request to like {len(request.tracks)} songs.")
    
    # FIXED: Run the blocking 'open_tidal_session' in a separate thread
    tidal_session = await asyncio.to_thread(open_tidal_session)
    
    if not tidal_session.check_login():
        return {"status": "error", "message": "Tidal login required."}
    
    liked_count = 0
    for track_data in request.tracks:
        tidal_track = await tidal_search(track_data.dict(), tidal_session)
        if tidal_track:
            try:
                # FIXED: Run the blocking 'add_track' call in a separate thread
                await asyncio.to_thread(tidal_session.user.favorites.add_track, tidal_track.id)
                liked_count += 1
                print(f"Liked track: {track_data.name}")
            except Exception as e:
                print(f"Failed to like track {track_data.name}: {e}")
    
    return {"status": "success", "message": f"Successfully liked {liked_count}/{len(request.tracks)} songs on Tidal."}


@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest):
    print(f"Received request to add {len(request.albums)} albums.")
    
    # FIXED: Run the blocking 'open_tidal_session' in a separate thread
    tidal_session = await asyncio.to_thread(open_tidal_session)

    if not tidal_session.check_login():
        return {"status": "error", "message": "Tidal login required."}

    added_count = 0
    for album_data in request.albums:
        query = f"{album_data.name} {album_data.artists[0].name}"
        # FIXED: Run the blocking 'search' and 'add_album' calls in separate threads
        search_results = await asyncio.to_thread(tidal_session.search, query, models=[tidalapi.album.Album])
        if search_results['albums']:
            tidal_album_id = search_results['albums'][0].id
            try:
                await asyncio.to_thread(tidal_session.user.favorites.add_album, tidal_album_id)
                added_count += 1
                print(f"Added album: {album_data.name}")
            except Exception as e:
                print(f"Failed to add album {album_data.name}: {e}")
    
    return {"status": "success", "message": f"Successfully added {added_count}/{len(request.albums)} albums to your Tidal collection."}


# --- Playlist endpoint and background task (remains the same) ---
def run_transfer_process(playlists_to_transfer: List[dict]):
    # ... (this function's code is correct as provided before)
    pass

@app.post("/api/transfer/playlists")
async def transfer_playlists_to_tidal(request: TransferPlaylistRequest, background_tasks: BackgroundTasks):
    # ... (this function's code is correct as provided before)
    pass