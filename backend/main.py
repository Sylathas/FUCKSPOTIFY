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
from cache import failure_cache, track_match_cache, get_cache_summary, cleanup_caches

# --- In-memory stores ---
pending_logins: Dict[str, Tuple[tidalapi.Session, Any]] = {}
transfer_progress: Dict[str, Dict[str, Any]] = {}
failure_reports: Dict[str, Dict[str, Any]] = {}

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

class FailureReport(BaseModel):
    platform: str
    failed_songs: List[str]
    failed_albums: List[str] 
    failed_playlists: Dict[str, List[str]]
    total_failures: int

class PlatformConfig(BaseModel):
    name: str
    requires_auth: bool
    supports_progress: bool
    api_endpoint: Optional[str] = None
    auth_method: Optional[str] = None

# --- FastAPI App Setup ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PLATFORM_CONFIGS = {
    'TIDAL': {
        'name': 'Tidal',
        'requires_auth': True,
        'supports_progress': True,
        'api_endpoint': '/api/transfer',
        'auth_method': 'oauth',
        'handler': 'tidal_handler'
    },
    'BANDCAMP': {
        'name': 'Bandcamp', 
        'requires_auth': False,
        'supports_progress': False,
        'handler': 'bandcamp_handler'
    },
    'APPLE_MUSIC': {
        'name': 'Apple Music',
        'requires_auth': True,
        'supports_progress': True,
        'api_endpoint': '/api/apple-music/transfer',
        'auth_method': 'oauth',
        'handler': 'apple_music_handler'  # For future implementation
    },
    'SOUNDCLOUD': {
        'name': 'SoundCloud',
        'requires_auth': True,
        'supports_progress': True,
        'api_endpoint': '/api/soundcloud/transfer', 
        'auth_method': 'oauth',
        'handler': 'soundcloud_handler'  # For future implementation
    },
    'YOUTUBE_MUSIC': {
        'name': 'YouTube Music',
        'requires_auth': True,
        'supports_progress': True,
        'api_endpoint': '/api/youtube-music/transfer',
        'auth_method': 'oauth', 
        'handler': 'youtube_music_handler'  # For future implementation
    }
}

# --- Helper Functions ---
def get_tidal_session(token: str) -> tidalapi.Session:
    """Create a Tidal session with the provided token."""
    session = tidalapi.Session()
    session.load_oauth_session(token_type="Bearer", access_token=token)
    if not session.check_login():
        raise HTTPException(status_code=401, detail="Invalid or expired Tidal token.")
    return session

def update_progress(transfer_id: str, status: str, step: str, progress: int, 
                   completed: int = 0, total: int = 0, current_playlist: str = None,
                   failed_items: dict = None):
    """Enhanced progress update with failure tracking."""
    transfer_progress[transfer_id] = {
        "status": status,
        "current_step": step,
        "progress_percent": progress,
        "completed_playlists": completed,
        "total_playlists": total,
        "current_playlist": current_playlist,
        "last_updated": time.time()
    }
    
    # Track failures if provided
    if failed_items:
        if transfer_id not in failure_reports:
            failure_reports[transfer_id] = {
                "platform": "Tidal",  # Default, can be made dynamic
                "failed_songs": [],
                "failed_albums": [],
                "failed_playlists": {},
                "total_failures": 0
            }
        
        # Merge failure data
        report = failure_reports[transfer_id]
        if 'songs' in failed_items:
            report["failed_songs"].extend(failed_items['songs'])
        if 'albums' in failed_items:
            report["failed_albums"].extend(failed_items['albums'])
        if 'playlists' in failed_items:
            for playlist_name, failed_tracks in failed_items['playlists'].items():
                if playlist_name not in report["failed_playlists"]:
                    report["failed_playlists"][playlist_name] = []
                report["failed_playlists"][playlist_name].extend(failed_tracks)
        
        # Update total count
        report["total_failures"] = (
            len(report["failed_songs"]) + 
            len(report["failed_albums"]) + 
            sum(len(tracks) for tracks in report["failed_playlists"].values())
        )

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
    """Like songs on Tidal with proper failure tracking."""
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    liked_count = 0
    failed_tracks = []
    
    print(f"Starting to like {len(request.tracks)} songs on Tidal")
    
    # Generate a transfer ID for tracking failures
    transfer_id = str(uuid.uuid4())
    
    # Initialize failure report for this operation
    failure_reports[transfer_id] = {
        "platform": "Tidal",
        "failed_songs": [],
        "failed_albums": [],
        "failed_playlists": {},
        "total_failures": 0
    }
    
    for i, track_data in enumerate(request.tracks):
        try:
            # Convert Pydantic model to dict for your existing function
            track_dict = track_data.dict()
            tidal_track = await tidal_search_single(track_dict, tidal_session)
            
            if tidal_track:
                await asyncio.to_thread(tidal_session.user.favorites.add_track, str(tidal_track.id))
                liked_count += 1
                print(f"✓ Liked ({i+1}/{len(request.tracks)}): {track_data.name}")
            else:
                artist_names = ', '.join([artist.name for artist in track_data.artists])
                failed_msg = f"{track_data.name} - {artist_names}"
                failed_tracks.append(failed_msg)
                failure_reports[transfer_id]["failed_songs"].append(failed_msg)
                print(f"✗ Not found: {failed_msg}")
        except Exception as e:
            artist_names = ', '.join([artist.name for artist in track_data.artists])
            error_msg = f"{track_data.name} - {artist_names} (Error: {str(e)})"
            failed_tracks.append(error_msg)
            failure_reports[transfer_id]["failed_songs"].append(error_msg)
            print(f"✗ Failed to like: {error_msg}")
    
    # Update total failures count
    failure_reports[transfer_id]["total_failures"] = len(failure_reports[transfer_id]["failed_songs"])
    
    result_msg = f"Successfully liked {liked_count}/{len(request.tracks)} songs."
    print(f"✓ Song liking completed: {result_msg}")
    
    return {
        "status": "success", 
        "message": result_msg,
        "failed": failed_tracks,
        "success_count": liked_count,
        "total_count": len(request.tracks),
        "transfer_id": transfer_id  # Return transfer_id so frontend can get failure report
    }

@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest, authorization: str = Header(...)):
    """Add albums to Tidal favorites with proper failure tracking."""
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    added_count = 0
    failed_albums = []
    
    print(f"Starting to add {len(request.albums)} albums to Tidal")
    
    # Generate a transfer ID for tracking failures
    transfer_id = str(uuid.uuid4())
    
    # Initialize failure report for this operation
    failure_reports[transfer_id] = {
        "platform": "Tidal",
        "failed_songs": [],
        "failed_albums": [],
        "failed_playlists": {},
        "total_failures": 0
    }
    
    for i, album_data in enumerate(request.albums):
        try:
            query = f"{album_data.name} {album_data.artists[0].name}"
            search_results = await asyncio.to_thread(
                tidal_session.search, query, models=[tidalapi.album.Album]
            )
            
            if search_results['albums']:
                tidal_album_id = search_results['albums'][0].id
                await asyncio.to_thread(tidal_session.user.favorites.add_album, str(tidal_album_id))
                added_count += 1
                print(f"✓ Added ({i+1}/{len(request.albums)}): {album_data.name}")
            else:
                artist_names = ', '.join([artist.name for artist in album_data.artists])
                failed_msg = f"{album_data.name} - {artist_names}"
                failed_albums.append(failed_msg)
                failure_reports[transfer_id]["failed_albums"].append(failed_msg)
                print(f"✗ Not found: {failed_msg}")
        except Exception as e:
            artist_names = ', '.join([artist.name for artist in album_data.artists])
            error_msg = f"{album_data.name} - {artist_names} (Error: {str(e)})"
            failed_albums.append(error_msg)
            failure_reports[transfer_id]["failed_albums"].append(error_msg)
            print(f"✗ Failed to add: {error_msg}")
    
    # Update total failures count
    failure_reports[transfer_id]["total_failures"] = len(failure_reports[transfer_id]["failed_albums"])
    
    result_msg = f"Successfully added {added_count}/{len(request.albums)} albums."
    print(f"✓ Album adding completed: {result_msg}")
    
    return {
        "status": "success", 
        "message": result_msg,
        "failed": failed_albums,
        "success_count": added_count,
        "total_count": len(request.albums),
        "transfer_id": transfer_id  # Return transfer_id so frontend can get failure report
    }

# --- Playlist Transfer with Progress Tracking ---
async def run_playlist_transfer_process_async(token: str, playlists: List[dict], transfer_id: str):
    """Enhanced async background task with comprehensive cache integration."""
    try:
        print(f"🎵 Starting enhanced playlist transfer process: {transfer_id}")
        tidal_session = get_tidal_session(token)
        config_obj, config_dict = get_tidal_config()
        
        total_playlists = len(playlists)
        
        # Create transfer report in cache
        total_songs = sum(len(p.get('tracks', [])) for p in playlists)
        failure_cache.create_transfer_report(
            transfer_id=transfer_id,
            platform="Tidal",
            total_songs=total_songs,
            total_playlists=total_playlists
        )
        
        update_progress(transfer_id, "running", "Starting transfer", 0, 0, total_playlists)
        
        playlist_failures = {}
        successful_playlists = 0
        
        for i, playlist_data in enumerate(playlists):
            playlist_name = playlist_data.get('name', f'Playlist {i+1}')
            track_count = len(playlist_data.get('tracks', []))
            
            print(f"🔄 Processing playlist {i+1}/{total_playlists}: {playlist_name}")
            
            update_progress(
                transfer_id, "running", 
                f"Processing playlist: {playlist_name}", 
                int((i / total_playlists) * 100),
                i, total_playlists, playlist_name
            )
            
            # Track initial failed track count
            spotify_tracks = playlist_data.get('tracks', [])
            initial_cache_failures = len([
                t for t in spotify_tracks 
                if failure_cache.has_match_failure(t.get('id', ''))
            ])
            
            try:
                # Process the playlist
                await sync_playlist(tidal_session, playlist_data, config_dict)
                
                # Check for new failures after processing
                final_failed_tracks = []
                for track in spotify_tracks:
                    track_id = track.get('id', '')
                    if track_id and failure_cache.has_match_failure(track_id):
                        artist_names = ', '.join([artist.get('name', '') for artist in track.get('artists', [])])
                        final_failed_tracks.append(f"{track.get('name', 'Unknown')} - {artist_names}")
                
                if final_failed_tracks:
                    playlist_failures[playlist_name] = final_failed_tracks
                    print(f"⚠️  {len(final_failed_tracks)} tracks failed in playlist '{playlist_name}'")
                else:
                    successful_playlists += 1
                    print(f"✅ All tracks found for playlist '{playlist_name}'")
                
            except Exception as e:
                print(f"❌ Failed to process playlist '{playlist_name}': {e}")
                playlist_failures[playlist_name] = [f"Failed to create playlist: {str(e)}"]
            
            print(f"✅ Completed playlist: {playlist_name}")
        
        # Update transfer report with final results
        failure_cache.update_transfer_failures(
            transfer_id=transfer_id,
            failed_playlists=playlist_failures
        )
        
        failure_cache.complete_transfer_report(
            transfer_id=transfer_id,
            status="completed"
        )
        
        # Record final statistics
        failure_cache.record_transfer_stats(
            platform="Tidal",
            playlists_attempted=total_playlists,
            playlists_successful=successful_playlists
        )
        
        # Update final progress
        failed_items = {"playlists": playlist_failures} if playlist_failures else None
        update_progress(
            transfer_id, "completed", "All playlists transferred", 100, 
            total_playlists, total_playlists, failed_items=failed_items
        )
        
        print(f"🎉 Transfer completed: {transfer_id}")
        if playlist_failures:
            total_failed = sum(len(tracks) for tracks in playlist_failures.values())
            print(f"⚠️  Total failed tracks: {total_failed}")
        
    except Exception as e:
        error_msg = f"Transfer failed: {str(e)}"
        print(f"❌ BACKGROUND TASK ERROR: {error_msg}")
        
        # Mark transfer as failed in cache
        failure_cache.complete_transfer_report(
            transfer_id=transfer_id,
            status="failed"
        )
        
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

@app.get("/api/cache/summary")
async def get_cache_summary_endpoint():
    """Get comprehensive cache statistics and summary."""
    summary = get_cache_summary()
    
    # Add success rates for different platforms
    success_rates = {}
    for platform in ['Tidal', 'Bandcamp']:  # Add more as you implement them
        rates = failure_cache.get_success_rates(platform=platform, days=30)
        if not rates.get('no_data'):
            success_rates[platform] = rates
    
    summary['success_rates'] = success_rates
    return summary

@app.post("/api/cache/cleanup")
async def cleanup_cache_data(days: int = 30):
    """Clean up old cache data."""
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 365")
    
    result = cleanup_caches(days)
    return {
        "message": f"Cache cleanup completed for data older than {days} days",
        **result
    }

@app.get("/api/cache/failures/{track_id}")
async def get_track_failure_info(track_id: str):
    """Get detailed failure information for a specific track."""
    failure_info = failure_cache.get_failure_info(track_id)
    
    if not failure_info:
        return {"track_id": track_id, "has_failures": False}
    
    return {
        "track_id": track_id,
        "has_failures": True,
        **failure_info
    }

@app.delete("/api/cache/failures/{track_id}")
async def clear_track_failure(track_id: str):
    """Clear failure cache for a specific track (allow retry)."""
    failure_cache.remove_match_failure(track_id)
    track_match_cache.remove(track_id)
    
    return {"message": f"Failure cache cleared for track {track_id}"}

# --- Health Check Endpoint ---
@app.get("/api/health")
async def health_check():
    """Enhanced health check with comprehensive cache statistics."""
    config = get_performance_config()
    cache_summary = get_cache_summary()
    
    return {
        "status": "healthy",
        "config_loaded": True,
        "active_transfers": len(transfer_progress),
        "pending_logins": len(pending_logins),
        "failure_reports": len(failure_reports),
        "supported_platforms": list(PLATFORM_CONFIGS.keys()),
        "search_batch_size": config["search_batch_size"],
        "max_concurrency": config["max_concurrency"],
        "cache_stats": {
            "track_cache_size": cache_summary["track_cache"]["total_cached"],
            "track_cache_hit_rate": cache_summary["track_cache"]["hit_rate_percent"],
            "active_failures": cache_summary["failure_stats"]["active_failures"],
            "total_recent_failures": cache_summary["failure_stats"]["total_failures_in_period"]
        }
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

# -- Failure endpoint --
@app.get("/api/transfer/failures/{transfer_id}", response_model=FailureReport)
async def get_failure_report(transfer_id: str):
    """Get comprehensive failure report using cache data."""
    
    # Try to get from cache first (more detailed)
    cache_report = failure_cache.get_transfer_report(transfer_id)
    
    if cache_report:
        return FailureReport(
            platform=cache_report["platform"],
            failed_songs=cache_report["failed_songs"],
            failed_albums=cache_report["failed_albums"],
            failed_playlists=cache_report["failed_playlists"],
            total_failures=cache_report["total_failures"]
        )
    
    # Fallback to memory store if not in cache
    if transfer_id not in failure_reports:
        if transfer_id not in transfer_progress:
            raise HTTPException(status_code=404, detail="Transfer not found")
        
        return FailureReport(
            platform="Tidal",
            failed_songs=[],
            failed_albums=[], 
            failed_playlists={},
            total_failures=0
        )
    
    report = failure_reports[transfer_id]
    return FailureReport(
        platform=report["platform"],
        failed_songs=report["failed_songs"],
        failed_albums=report["failed_albums"],
        failed_playlists=report["failed_playlists"],
        total_failures=report["total_failures"]
    )

# -- Platform endpoint --
@app.get("/api/platforms")
async def get_platform_configs():
    """Get available platform configurations for frontend."""
    return {
        "platforms": PLATFORM_CONFIGS,
        "supported": list(PLATFORM_CONFIGS.keys()),
        "active": ["TIDAL", "BANDCAMP"]  # Currently implemented platforms
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting FuckSpotify API server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)