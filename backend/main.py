import asyncio
import uuid
import os
import time
from fastapi import FastAPI, Header, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
import tidalapi
from tidalapi import Config

# Import your library functions
from sync import sync_playlist, tidal_search_single

# --- In-memory stores ---
pending_logins: Dict[str, Tuple[tidalapi.Session, Any]] = {}
transfer_progress: Dict[str, Dict[str, Any]] = {}

# --- Performance Configuration (No external files needed) ---
def get_performance_config():
    """Get performance configuration from environment variables with fallbacks."""
    config = {
        'max_concurrency': int(os.getenv('TIDAL_MAX_CONCURRENCY', 5)),
        'rate_limit': int(os.getenv('TIDAL_RATE_LIMIT', 10)),
        'search_batch_size': int(os.getenv('TIDAL_SEARCH_BATCH_SIZE', 3)),
        'search_delay': float(os.getenv('TIDAL_SEARCH_DELAY', 0.8)),
        'playlist_chunk_size': int(os.getenv('TIDAL_PLAYLIST_CHUNK_SIZE', 15)),
        'track_fetch_limit': int(os.getenv('TIDAL_TRACK_FETCH_LIMIT', 50)),
        'enable_caching': os.getenv('TIDAL_ENABLE_CACHING', 'true').lower() == 'true',
        'cache_expiry': int(os.getenv('TIDAL_CACHE_EXPIRY', 3600)),
        'request_timeout': int(os.getenv('TIDAL_REQUEST_TIMEOUT', 30)),
        'retry_attempts': int(os.getenv('TIDAL_RETRY_ATTEMPTS', 3)),
        'retry_delay': int(os.getenv('TIDAL_RETRY_DELAY', 2))
    }
    
    # Debug output
    print("=== TIDAL CONFIG ===")
    for key, value in config.items():
        env_var = f"TIDAL_{key.upper()}"
        source = "ENV" if os.getenv(env_var) else "DEFAULT"
        print(f"{key}: {value} ({source})")
    print("===================")
    
    return config

def get_tidal_config():
    """Get Tidal configuration object."""
    config_dict = get_performance_config()
    
    config_obj = Config()
    config_obj.max_concurrency = config_dict['max_concurrency']
    config_obj.rate_limit = config_dict['rate_limit']
    
    # Add custom properties for our search optimization
    config_obj.search_batch_size = config_dict['search_batch_size']
    config_obj.search_delay = config_dict['search_delay']
    config_obj.playlist_chunk_size = config_dict['playlist_chunk_size']
    
    return config_obj, config_dict

# --- Pydantic Models ---
class SpotifyArtist(BaseModel): 
    name: str

class SpotifyTrack(BaseModel): 
    id: str
    name: str
    artists: List[SpotifyArtist]
    duration: int
    isrc: Optional[str] = None

class SpotifyImage(BaseModel):
    url: str
    height: Optional[int] = None
    width: Optional[int] = None

class SpotifyPlaylist(BaseModel): 
    id: str
    name: str
    description: Optional[str] = None
    tracks: Optional[List[SpotifyTrack]] = []
    images: Optional[List[SpotifyImage]] = []
    coverImage: Optional[str] = None
    trackCount: Optional[int] = None
    isPublic: Optional[bool] = None
    collaborative: Optional[bool] = None
    owner: Optional[Dict[str, Any]] = None
    spotifyUrl: Optional[str] = None

class SpotifyAlbum(BaseModel): 
    id: str
    name: str
    artists: List[SpotifyArtist]

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

class ProgressResponse(BaseModel):
    transfer_id: str
    status: str
    current_step: str
    progress_percent: int
    completed_playlists: int
    total_playlists: int
    current_playlist: Optional[str] = None
    estimated_time_remaining: Optional[int] = None

# --- FastAPI App Setup ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper Functions ---
def get_tidal_session(token: str) -> tidalapi.Session:
    """Create a Tidal session with the provided token."""
    session = tidalapi.Session()
    session.load_oauth_session(token_type="Bearer", access_token=token)
    if not session.check_login():
        raise HTTPException(status_code=401, detail="Invalid or expired Tidal token.")
    return session

def update_progress(transfer_id: str, status: str, step: str, progress: int, 
                   completed: int = 0, total: int = 0, current_playlist: str = None):
    """Update progress for a transfer operation."""
    transfer_progress[transfer_id] = {
        "status": status,
        "current_step": step,
        "progress_percent": progress,
        "completed_playlists": completed,
        "total_playlists": total,
        "current_playlist": current_playlist,
        "last_updated": time.time()
    }

# --- Authentication Endpoints ---
@app.get("/api/tidal/initiate-login", response_model=LoginInitResponse)
def initiate_tidal_login():
    """Initiate Tidal OAuth login process."""
    config_obj, _ = get_tidal_config()
    
    session = tidalapi.Session(config=config_obj)
    login, future = session.login_oauth()
    poll_key = str(uuid.uuid4())
    pending_logins[poll_key] = (session, future)
    
    login_url = login.verification_uri_complete
    if not login_url.startswith('https://'):
        login_url = 'https://' + login_url
    
    print(f"Initiated Tidal login with poll_key: {poll_key}")
    return {"login_url": login_url, "poll_key": poll_key}

@app.post("/api/tidal/verify-login", response_model=LoginVerifyResponse)
async def verify_tidal_login(request: LoginVerifyRequest):
    """Verify Tidal OAuth login completion."""
    login_attempt = pending_logins.get(request.poll_key)
    if not login_attempt:
        raise HTTPException(status_code=404, detail="Login session not found or expired.")

    session, future = login_attempt
    if future.done():
        try:
            login_success = future.result()
            if not login_success:
                raise Exception("Login was not successful.")
            access_token = session.access_token
            if request.poll_key in pending_logins:
                del pending_logins[request.poll_key]
            print(f"✓ Tidal login successful for poll_key: {request.poll_key}")
            return {"status": "completed", "access_token": access_token}
        except BaseException as e:
            print(f"✗ TIDAL LOGIN FAILED: {type(e).__name__} - {e}")
            if request.poll_key in pending_logins:
                del pending_logins[request.poll_key] 
            raise HTTPException(status_code=500, detail="Tidal login process failed unexpectedly.")
    else:
        return {"status": "pending"}

# --- Transfer Endpoints ---
@app.post("/api/like/songs")
async def like_songs_on_tidal(request: LikeSongsRequest, authorization: str = Header(...)):
    """Like songs on Tidal."""
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    liked_count = 0
    failed_tracks = []
    
    print(f"Starting to like {len(request.tracks)} songs on Tidal")
    
    for i, track_data in enumerate(request.tracks):
        try:
            tidal_track = await tidal_search_single(track_data.dict(), tidal_session)
            if tidal_track:
                # FIX: Convert to string, don't pass as list
                await asyncio.to_thread(tidal_session.user.favorites.add_track, str(tidal_track.id))
                liked_count += 1
                print(f"✓ Liked ({i+1}/{len(request.tracks)}): {track_data.name}")
            else:
                failed_msg = f"Not found: {track_data.name}"
                failed_tracks.append(failed_msg)
                print(f"✗ {failed_msg}")
        except Exception as e:
            error_msg = f"Failed to like '{track_data.name}': {str(e)}"
            failed_tracks.append(error_msg)
            print(f"✗ {error_msg}")
    
    result_msg = f"Successfully liked {liked_count}/{len(request.tracks)} songs."
    print(f"✓ Song liking completed: {result_msg}")
    
    return {
        "status": "success", 
        "message": result_msg,
        "failed": failed_tracks
    }

@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest, authorization: str = Header(...)):
    """Add albums to Tidal favorites."""
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    added_count = 0
    failed_albums = []
    
    print(f"Starting to add {len(request.albums)} albums to Tidal")
    
    for i, album_data in enumerate(request.albums):
        try:
            query = f"{album_data.name} {album_data.artists[0].name}"
            search_results = await asyncio.to_thread(
                tidal_session.search, query, models=[tidalapi.album.Album]
            )
            
            if search_results['albums']:
                tidal_album_id = search_results['albums'][0].id
                # FIX: Convert to string, don't pass as list
                await asyncio.to_thread(tidal_session.user.favorites.add_album, str(tidal_album_id))
                added_count += 1
                print(f"✓ Added ({i+1}/{len(request.albums)}): {album_data.name}")
            else:
                failed_msg = f"Not found: {album_data.name}"
                failed_albums.append(failed_msg)
                print(f"✗ {failed_msg}")
        except Exception as e:
            error_msg = f"Failed to add '{album_data.name}': {str(e)}"
            failed_albums.append(error_msg)
            print(f"✗ {error_msg}")
    
    result_msg = f"Successfully added {added_count}/{len(request.albums)} albums."
    print(f"✓ Album adding completed: {result_msg}")
    
    return {
        "status": "success", 
        "message": result_msg,
        "failed": failed_albums
    }

# --- Playlist Transfer with Progress Tracking ---
async def run_playlist_transfer_process_async(token: str, playlists: List[dict], transfer_id: str):
    """Async background task for transferring playlists with full metadata support."""
    try:
        print(f"🎵 Starting enhanced playlist transfer process: {transfer_id}")
        tidal_session = get_tidal_session(token)
        config_obj, config_dict = get_tidal_config()
        
        total_playlists = len(playlists)
        update_progress(transfer_id, "running", "Starting transfer", 0, 0, total_playlists)
        
        for i, playlist_data in enumerate(playlists):
            playlist_name = playlist_data.get('name', f'Playlist {i+1}')
            playlist_description = playlist_data.get('description', '')
            playlist_cover = playlist_data.get('coverImage')
            track_count = len(playlist_data.get('tracks', []))
            
            print(f"🔄 Processing playlist {i+1}/{total_playlists}: {playlist_name}")
            print(f"   📊 {track_count} tracks")
            print(f"   📝 Description: {playlist_description[:50] + '...' if playlist_description else 'None'}")
            print(f"   🖼️  Cover: {'Yes' if playlist_cover else 'None'}")
            
            update_progress(
                transfer_id, "running", 
                f"Processing playlist: {playlist_name}", 
                int((i / total_playlists) * 100),
                i, total_playlists, playlist_name
            )
            
            # Now properly awaited
            await sync_playlist(tidal_session, playlist_data, config_dict)
            
            print(f"✅ Completed playlist: {playlist_name}")
        
        print(f"🎉 All playlists transferred successfully: {transfer_id}")
        update_progress(transfer_id, "completed", "All playlists transferred", 100, total_playlists, total_playlists)
        
    except Exception as e:
        error_msg = f"Transfer failed: {str(e)}"
        print(f"❌ BACKGROUND TASK ERROR: {error_msg}")
        update_progress(transfer_id, "failed", error_msg, 0, 0, len(playlists))

def run_playlist_transfer_process(token: str, playlists: List[dict], transfer_id: str):
    """Sync wrapper that runs the async function in a new event loop."""
    import asyncio
    try:
        # Create new event loop for the background task
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(run_playlist_transfer_process_async(token, playlists, transfer_id))
    except Exception as e:
        print(f"Background task wrapper error: {e}")
        update_progress(transfer_id, "failed", f"Task error: {str(e)}", 0, 0, len(playlists))
    finally:
        loop.close()

@app.post("/api/transfer/playlists")
async def transfer_playlists_to_tidal(request: TransferPlaylistRequest, background_tasks: BackgroundTasks, authorization: str = Header(...)):
    """Start playlist transfer to Tidal in background."""
    token = authorization.split(" ")[1]
    transfer_id = str(uuid.uuid4())
    playlists_as_dicts = [p.dict(exclude_none=True) for p in request.playlists]
    
    print(f"🚀 Initiating playlist transfer: {transfer_id} ({len(playlists_as_dicts)} playlists)")
    
    # Use the sync wrapper for BackgroundTasks
    background_tasks.add_task(run_playlist_transfer_process, token, playlists_as_dicts, transfer_id)
    
    return {
        "status": "success", 
        "message": "Playlist transfer has been started in the background.",
        "transfer_id": transfer_id
    }

# --- Progress Polling Endpoint ---
@app.get("/api/transfer/progress/{transfer_id}", response_model=ProgressResponse)
async def get_transfer_progress(transfer_id: str):
    """Get progress of a transfer operation."""
    if transfer_id not in transfer_progress:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    progress = transfer_progress[transfer_id]
    
    # Clean up completed/failed transfers after 1 hour
    if progress["status"] in ["completed", "failed"] and time.time() - progress["last_updated"] > 3600:
        del transfer_progress[transfer_id]
        raise HTTPException(status_code=404, detail="Transfer expired")
    
    return ProgressResponse(
        transfer_id=transfer_id,
        status=progress["status"],
        current_step=progress["current_step"],
        progress_percent=progress["progress_percent"],
        completed_playlists=progress["completed_playlists"],
        total_playlists=progress["total_playlists"],
        current_playlist=progress.get("current_playlist")
    )

# --- Health Check Endpoint ---
@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    config = get_performance_config()
    return {
        "status": "healthy",
        "config_loaded": True,
        "active_transfers": len(transfer_progress),
        "pending_logins": len(pending_logins),
        "search_batch_size": config["search_batch_size"],
        "max_concurrency": config["max_concurrency"]
    }

# --- Root endpoint ---
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "FuckSpotify Tidal API Backend",
        "version": "2.0",
        "endpoints": {
            "health": "/api/health",
            "login": "/api/tidal/initiate-login",
            "verify": "/api/tidal/verify-login", 
            "like_songs": "/api/like/songs",
            "add_albums": "/api/add/albums",
            "transfer_playlists": "/api/transfer/playlists",
            "progress": "/api/transfer/progress/{transfer_id}"
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting FuckSpotify API server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)