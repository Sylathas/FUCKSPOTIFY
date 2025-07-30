import yaml
import asyncio
import uuid
from fastapi import FastAPI, Header, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
import tidalapi
from tidalapi import Config

# Import your library functions
from sync import sync_playlist, tidal_search

# --- In-memory store for pending logins ---
# FIXED: Store a tuple of (session, future) to keep track of the session object
pending_logins: Dict[str, Tuple[tidalapi.Session, Any]] = {}

# --- Pydantic Models (No changes here) ---
class SpotifyArtist(BaseModel): name: str
class SpotifyTrack(BaseModel): id: str; name: str; artists: List[SpotifyArtist]; duration: int; isrc: Optional[str] = None
class SpotifyPlaylist(BaseModel): id: str; name: str; description: Optional[str] = None; tracks: Optional[List[SpotifyTrack]] = []
class SpotifyAlbum(BaseModel): id: str; name: str; artists: List[SpotifyArtist]
class LoginInitResponse(BaseModel): login_url: str; poll_key: str
class LoginVerifyRequest(BaseModel): poll_key: str
class LoginVerifyResponse(BaseModel): status: str; access_token: Optional[str] = None
class LikeSongsRequest(BaseModel): tracks: List[SpotifyTrack]
class AddAlbumsRequest(BaseModel): albums: List[SpotifyAlbum]
class TransferPlaylistRequest(BaseModel): playlists: List[SpotifyPlaylist]

# --- FastAPI App Setup ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper Function (No changes here) ---
def get_tidal_session(token: str) -> tidalapi.Session:
    session = tidalapi.Session()
    session.load_oauth_session(session_id=None, token_type="Bearer", access_token=token)
    if not session.check_login():
        raise HTTPException(status_code=401, detail="Invalid or expired Tidal token.")
    return session

# --- Authentication Endpoints ---
@app.get("/api/tidal/initiate-login", response_model=LoginInitResponse)
def initiate_tidal_login():
    config_dict = None
    try:
        with open('config.yml', 'r') as f:
            config_dict = yaml.safe_load(f)
    except FileNotFoundError:
        pass

    config_obj = Config()
    if config_dict:
        config_obj.max_concurrency = config_dict.get('max_concurrency', 10)
        config_obj.rate_limit = config_dict.get('rate_limit', 10)
    
    session = tidalapi.Session(config=config_obj)
    login, future = session.login_oauth()
    poll_key = str(uuid.uuid4())
    
    # --- FIXED: Store both the session and the future ---
    pending_logins[poll_key] = (session, future)
    
    login_url = login.verification_uri_complete
    if not login_url.startswith('https://'):
        login_url = 'https://' + login_url
    
    return {"login_url": login_url, "poll_key": poll_key}

@app.post("/api/tidal/verify-login", response_model=LoginVerifyResponse)
async def verify_tidal_login(request: LoginVerifyRequest):
    login_attempt = pending_logins.get(request.poll_key)
    if not login_attempt:
        raise HTTPException(status_code=404, detail="Login session not found or expired.")

    session, future = login_attempt
    if future.done():
        try:
            # future.result() will return True/False and raise errors
            login_success = future.result()
            if not login_success:
                raise Exception("Login was not successful.")

            # --- FIXED: Get the token from the stored session object ---
            access_token = session.access_token
            
            if request.poll_key in pending_logins:
                del pending_logins[request.poll_key]
            return {"status": "completed", "access_token": access_token}
        except BaseException as e:
            print(f"TIDAL LOGIN FAILED: {type(e).__name__} - {e}")
            if request.poll_key in pending_logins:
                del pending_logins[request.poll_key] 
            raise HTTPException(status_code=500, detail="Tidal login process failed unexpectedly.")
    else:
        return {"status": "pending"}

@app.post("/api/like/songs")
async def like_songs_on_tidal(request: LikeSongsRequest, authorization: str = Header(...)):
    token = authorization.split(" ")[1]; tidal_session = get_tidal_session(token); liked_count = 0
    for track_data in request.tracks:
        tidal_track = await tidal_search(track_data.dict(), tidal_session)
        if tidal_track:
            try:
                await asyncio.to_thread(tidal_session.user.favorites.add_track, tidal_track.id)
                liked_count += 1; print(f"Liked track: {track_data.name}")
            except Exception as e: print(f"Failed to like track {track_data.name}: {e}")
    return {"status": "success", "message": f"Successfully liked {liked_count}/{len(request.tracks)} songs."}

@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest, authorization: str = Header(...)):
    token = authorization.split(" ")[1]; tidal_session = get_tidal_session(token); added_count = 0
    for album_data in request.albums:
        query = f"{album_data.name} {album_data.artists[0].name}"
        search_results = await asyncio.to_thread(tidal_session.search, query, models=[tidalapi.album.Album])
        if search_results['albums']:
            tidal_album_id = search_results['albums'][0].id
            try:
                await asyncio.to_thread(tidal_session.user.favorites.add_album, tidal_album_id)
                added_count += 1; print(f"Added album: {album_data.name}")
            except Exception as e: print(f"Failed to add album {album_data.name}: {e}")
    return {"status": "success", "message": f"Successfully added {added_count}/{len(request.albums)} albums."}
    
# --- Playlist Transfer Endpoint & Background Task ---
def run_playlist_transfer_process(token: str, playlists: List[dict]):
    """Background task for transferring playlists."""
    try:
        tidal_session = get_tidal_session(token)
        config_dict = None
        try:
            with open('config.yml', 'r') as f:
                config_dict = yaml.safe_load(f)
        except FileNotFoundError:
            pass
        
        config_obj = Config()
        if config_dict:
            config_obj.max_concurrency = config_dict.get('max_concurrency', 10)
            config_obj.rate_limit = config_dict.get('rate_limit', 10)
            
        for playlist_data in playlists:
            asyncio.run(sync_playlist(tidal_session, playlist_data, config_obj))
    except Exception as e:
        print(f"BACKGROUND TASK ERROR: {e}")

@app.post("/api/transfer/playlists")
async def transfer_playlists_to_tidal(request: TransferPlaylistRequest, background_tasks: BackgroundTasks, authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    playlists_as_dicts = [p.dict(exclude_none=True) for p in request.playlists]
    background_tasks.add_task(run_playlist_transfer_process, token, playlists_as_dicts)
    return {"status": "success", "message": "Playlist transfer has been started in the background."}