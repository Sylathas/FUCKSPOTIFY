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

# --- Pydantic Models ---
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
    images: List[SpotifyImage] = []
    coverImage: Optional[str] = None

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

# --- Models for Liking/Adding ---
class LikeSongsRequest(BaseModel):
    tracks: List[SpotifyTrack]

class AddAlbumsRequest(BaseModel):
    albums: List[SpotifyAlbum]

class TransferPlaylistRequest(BaseModel):
    playlists: List[SpotifyPlaylist]

# --- FastAPI App ---
app = FastAPI()
# (CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Like Songs ---
@app.post("/api/like/songs")
async def like_songs_on_tidal(request: LikeSongsRequest):
    print(f"Received request to like {len(request.tracks)} songs.")
    tidal_session = open_tidal_session()
    if not tidal_session.check_login():
        return {"status": "error", "message": "Tidal login required."}
    
    liked_count = 0
    for track_data in request.tracks:
        tidal_track = await tidal_search(track_data.dict(), tidal_session)
        if tidal_track:
            try:
                tidal_session.user.favorites.add_track(tidal_track.id)
                liked_count += 1
                print(f"Liked track: {track_data.name}")
            except Exception as e:
                print(f"Failed to like track {track_data.name}: {e}")
    
    return {"status": "success", "message": f"Successfully liked {liked_count}/{len(request.tracks)} songs on Tidal."}

# --- Add Albums ---
@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest):
    print(f"Received request to add {len(request.albums)} albums.")
    tidal_session = open_tidal_session()
    if not tidal_session.check_login():
        return {"status": "error", "message": "Tidal login required."}

    added_count = 0
    for album_data in request.albums:
        # Search for the album on Tidal
        query = f"{album_data.name} {album_data.artists[0].name}"
        search_results = tidal_session.search(query, models=[tidalapi.album.Album])
        if search_results['albums']:
            tidal_album_id = search_results['albums'][0].id
            try:
                tidal_session.user.favorites.add_album(tidal_album_id)
                added_count += 1
                print(f"Added album: {album_data.name}")
            except Exception as e:
                print(f"Failed to add album {album_data.name}: {e}")
    
    return {"status": "success", "message": f"Successfully added {added_count}/{len(request.albums)} albums to your Tidal collection."}

# --- Transfer Playlists ---
@app.post("/api/transfer/playlists")
async def transfer_playlists_to_tidal(request: TransferPlaylistRequest, background_tasks: BackgroundTasks):
    """
    This endpoint receives a list of playlists from the frontend
    and assigns the transfer job to a background task.
    """
    print(f"Received request to transfer {len(request.playlists)} playlists to Tidal.")
    
    # Pydantic models must be converted to standard Python dicts for the background task
    playlists_as_dicts = [p.dict(exclude_none=True) for p in request.playlists]
    
    # Add the long-running job to the background so we can respond immediately
    background_tasks.add_task(run_transfer_process, playlists_as_dicts)
    
    # Immediately confirm to the frontend that the job has started
    return {"status": "success", "message": "Tidal playlist transfer has been started."}


def run_transfer_process(playlists_to_transfer: List[dict]):
    """
    This function runs in the background to avoid HTTP timeouts.
    It handles the long process of syncing playlists to Tidal.
    """
    print("BACKGROUND TASK: Starting playlist transfer...")
    try:
        # Load the config file from within the backend directory
        with open('config.yml', 'r') as f:
            config = yaml.safe_load(f)
        
        # Authenticate with Tidal
        tidal_session = open_tidal_session(config=config)
        if not tidal_session.check_login():
            raise Exception("Tidal session is not valid. Please log in again via the console.")
        
        # Loop through each playlist received from the frontend and sync it
        for playlist_data in playlists_to_transfer:
            # We use asyncio.run because sync_playlist is an async (awaitable) function
            asyncio.run(sync_playlist(tidal_session, playlist_data, config))
            
        print("BACKGROUND TASK: All playlists processed successfully.")
    except Exception as e:
        print(f"BACKGROUND TASK ERROR: {e}")