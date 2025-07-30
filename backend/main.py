import yaml
import asyncio
import uuid
from fastapi import FastAPI, Header, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any # Import 'Any' for the fix
import tidalapi

# Import your library functions
from sync import sync_playlist, tidal_search

# --- In-memory store for pending logins ---
# FIXED: Changed the type hint to 'Any' which is more generic and robust
pending_logins: Dict[str, Any] = {}

# --- Pydantic Models for API validation ---
class SpotifyArtist(BaseModel):
    name: str

class SpotifyTrack(BaseModel):
    id: str
    name: str
    artists: List[SpotifyArtist]
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

# --- API Request/Response Models ---
class LoginInitResponse(BaseModel):
    login_url: str
    poll_key: str

class LoginVerifyRequest(BaseModel):
    poll_key: str

class LoginVerifyResponse(BaseModel):
    status: str
    access_token: Optional[str] = None

class LikeSongsRequest(BaseModel):
    tracks: List[SpotifyTrack]

class AddAlbumsRequest(BaseModel):
    albums: List[SpotifyAlbum]

class TransferPlaylistRequest(BaseModel):
    playlists: List[SpotifyPlaylist]

# --- FastAPI App Setup ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to your Netlify URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper Function ---
def get_tidal_session(token: str) -> tidalapi.Session:
    """Creates a Tidal session using a user's access token."""
    session = tidalapi.Session()
    # Note: We don't need a full session_id or refresh_token for this kind of auth
    session.load_oauth_session(session_id=None, token_type="Bearer", access_token=token)
    if not session.check_login():
        raise HTTPException(status_code=401, detail="Invalid or expired Tidal token.")
    return session

# --- Authentication Endpoints ---
@app.get("/api/tidal/initiate-login", response_model=LoginInitResponse)
def initiate_tidal_login():
    """Starts the Tidal device login flow and returns a URL for the user."""
    # --- Load the config file ---
    with open('config.yml', 'r') as f:
        config = yaml.safe_load(f)

    # --- Pass the config to the session ---
    session = tidalapi.Session(config=config)
    login, future = session.login_oauth()
    
    poll_key = str(uuid.uuid4())
    pending_logins[poll_key] = future
    
    login_url = login.verification_uri_complete
    if not login_url.startswith('https://'):
        login_url = 'https://' + login_url
    
    return {"login_url": login_url, "poll_key": poll_key}

@app.post("/api/tidal/verify-login", response_model=LoginVerifyResponse)
async def verify_tidal_login(request: LoginVerifyRequest):
    """Checks if the user has completed the login flow."""
    future = pending_logins.get(request.poll_key)
    if not future:
        raise HTTPException(status_code=404, detail="Login session not found or expired.")

    if future.done():
        # --- FINAL FIX: Catch BaseException to trap everything, including system exits ---
        try:
            session_data = future.result()
            # Clean up the successful login from our temporary store
            if request.poll_key in pending_logins:
                del pending_logins[request.poll_key]
            return {
                "status": "completed",
                "access_token": session_data.access_token,
            }
        except BaseException as e: # This is the key change
            # This will catch ANY error, including SystemExit
            print(f"TIDAL LOGIN FAILED WITH A SEVERE ERROR: {type(e).__name__} - {e}")
            # Clean up the failed login from our temporary store
            if request.poll_key in pending_logins:
                del pending_logins[request.poll_key] 
            raise HTTPException(status_code=500, detail="Tidal login process failed unexpectedly.")
    else:
        return {"status": "pending"}

# --- Transfer Endpoints ---
@app.post("/api/like/songs")
async def like_songs_on_tidal(request: LikeSongsRequest, authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    
    liked_count = 0
    for track_data in request.tracks:
        tidal_track = await tidal_search(track_data.dict(), tidal_session)
        if tidal_track:
            try:
                await asyncio.to_thread(tidal_session.user.favorites.add_track, tidal_track.id)
                liked_count += 1
                print(f"Liked track: {track_data.name}")
            except Exception as e:
                print(f"Failed to like track {track_data.name}: {e}")
    
    return {"status": "success", "message": f"Successfully liked {liked_count}/{len(request.tracks)} songs."}

@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest, authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)

    added_count = 0
    for album_data in request.albums:
        query = f"{album_data.name} {album_data.artists[0].name}"
        search_results = await asyncio.to_thread(tidal_session.search, query, models=[tidalapi.album.Album])
        if search_results['albums']:
            tidal_album_id = search_results['albums'][0].id
            try:
                await asyncio.to_thread(tidal_session.user.favorites.add_album, tidal_album_id)
                added_count += 1
                print(f"Added album: {album_data.name}")
            except Exception as e:
                print(f"Failed to add album {album_data.name}: {e}")
    
    return {"status": "success", "message": f"Successfully added {added_count}/{len(request.albums)} albums."}

def run_playlist_transfer_process(token: str, playlists: List[dict]):
    """Background task for transferring playlists."""
    try:
        tidal_session = get_tidal_session(token)
        with open('config.yml', 'r') as f:
            config = yaml.safe_load(f)
        for playlist_data in playlists:
            asyncio.run(sync_playlist(tidal_session, playlist_data, config))
    except Exception as e:
        print(f"BACKGROUND TASK ERROR: {e}")

@app.post("/api/transfer/playlists")
async def transfer_playlists_to_tidal(request: TransferPlaylistRequest, background_tasks: BackgroundTasks, authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    playlists_as_dicts = [p.dict(exclude_none=True) for p in request.playlists]
    background_tasks.add_task(run_playlist_transfer_process, token, playlists_as_dicts)
    return {"status": "success", "message": "Playlist transfer has been started in the background."}