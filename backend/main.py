import asyncio
import uuid
import os
import time
from fastapi import FastAPI, Header, HTTPException, BackgroundTasks, Response
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
        'max_concurrency': int(os.getenv('TIDAL_MAX_CONCURRENCY', 8)),  # Increased from 5
        'rate_limit': int(os.getenv('TIDAL_RATE_LIMIT', 15)),  # Increased from 10
        'search_batch_size': int(os.getenv('TIDAL_SEARCH_BATCH_SIZE', 8)),  # Increased from 3
        'search_delay': float(os.getenv('TIDAL_SEARCH_DELAY', 0.3)),  # Reduced from 0.8
        'playlist_chunk_size': int(os.getenv('TIDAL_PLAYLIST_CHUNK_SIZE', 25)),  # Increased from 15
        'track_fetch_limit': int(os.getenv('TIDAL_TRACK_FETCH_LIMIT', 100)),  # Increased from 50
        'enable_caching': os.getenv('TIDAL_ENABLE_CACHING', 'true').lower() == 'true',
        'cache_expiry': int(os.getenv('TIDAL_CACHE_EXPIRY', 3600)),
        'request_timeout': int(os.getenv('TIDAL_REQUEST_TIMEOUT', 30)),
        'retry_attempts': int(os.getenv('TIDAL_RETRY_ATTEMPTS', 3)),
        'retry_delay': int(os.getenv('TIDAL_RETRY_DELAY', 1))  # Reduced from 2
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

class UnifiedTransferRequest(BaseModel):
    tracks: List[SpotifyTrack]
    albums: List[SpotifyAlbum]
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
    # Enhanced progress tracking
    current_song: Optional[str] = None
    songs_processed: Optional[int] = None
    total_songs: Optional[int] = None
    songs_successful: Optional[int] = None
    songs_failed: Optional[int] = None
    current_operation: Optional[str] = None  # "searching", "adding", "liking", etc.

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
async def cleanup_poll_key(poll_key: str, delay: int = 10):
    """Clean up a poll key after a delay to allow for remaining polls."""
    await asyncio.sleep(delay)
    if poll_key in pending_logins:
        del pending_logins[poll_key]
        print(f"🧹 Cleaned up poll key: {poll_key}")

async def cleanup_old_pending_logins():
    """Clean up old pending logins to prevent memory leaks."""
    current_time = time.time()
    expired_keys = []
    
    for poll_key, login_data in pending_logins.items():
        # If it's a tuple with session and future, check if it's old
        if isinstance(login_data, tuple) and len(login_data) == 2:
            session, future = login_data
            # Clean up logins older than 10 minutes
            if hasattr(session, '_created_at') and current_time - session._created_at > 600:
                expired_keys.append(poll_key)
            # Also clean up if future is done but not handled
            elif future.done() and not isinstance(login_data[0], str):
                expired_keys.append(poll_key)
    
    for key in expired_keys:
        del pending_logins[key]
        print(f"🧹 Cleaned up expired pending login: {key}")
    
    return len(expired_keys)


def get_tidal_session(token: str) -> tidalapi.Session:
    """Create a Tidal session with the provided token."""
    try:
        session = tidalapi.Session()
        session.load_oauth_session(token_type="Bearer", access_token=token)
        
        # Check if the session is valid by making a test request
        if not session.check_login():
            raise HTTPException(status_code=401, detail="Invalid or expired Tidal token.")
        
        # Additional validation by making a simple API call
        try:
            # Try to get user info to validate the token
            user = session.user
            if not user or not hasattr(user, 'id'):
                raise HTTPException(status_code=401, detail="Tidal token validation failed.")
        except Exception as e:
            print(f"❌ Tidal token validation failed: {e}")
            raise HTTPException(status_code=401, detail="Tidal token validation failed. Please log in again.")
        
        return session
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"❌ Failed to create Tidal session: {e}")
        raise HTTPException(status_code=401, detail="Failed to authenticate with Tidal. Please log in again.")

def update_progress(transfer_id: str, status: str, step: str, progress: int, 
                   completed: int = 0, total: int = 0, current_playlist: str = None,
                   failed_items: dict = None, current_song: str = None,
                   songs_processed: int = None, total_songs: int = None,
                   songs_successful: int = None, songs_failed: int = None,
                   current_operation: str = None):
    """Enhanced progress update with detailed tracking."""
    transfer_progress[transfer_id] = {
        "status": status,
        "current_step": step,
        "progress_percent": progress,
        "completed_playlists": completed,
        "total_playlists": total,
        "current_playlist": current_playlist,
        "current_song": current_song,
        "songs_processed": songs_processed,
        "total_songs": total_songs,
        "songs_successful": songs_successful,
        "songs_failed": songs_failed,
        "current_operation": current_operation,
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
    session._created_at = time.time()  # Track creation time for cleanup
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

    # Check if this is a completed login (stored as tuple)
    if isinstance(login_attempt, tuple) and login_attempt[0] == "completed":
        access_token = login_attempt[1]
        # Clean up after a short delay to allow for remaining polls
        import asyncio
        asyncio.create_task(cleanup_poll_key(request.poll_key))
        return {"status": "completed", "access_token": access_token}

    session, future = login_attempt
    if future.done():
        try:
            login_success = future.result()
            if not login_success:
                raise Exception("Login was not successful.")
            access_token = session.access_token
            # Mark as completed but keep for a short time to handle remaining polls
            pending_logins[request.poll_key] = ("completed", access_token)
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
async def like_songs_on_tidal(request: LikeSongsRequest, authorization: str = Header(...), response: Response = None):
    """Like songs on Tidal with proper failure tracking."""
    try:
        token = authorization.split(" ")[1]
        tidal_session = get_tidal_session(token)
    except HTTPException as e:
        # Token validation failed
        print(f"❌ Token validation failed: {e.detail}")
        raise e
    except Exception as e:
        print(f"❌ Failed to get Tidal session: {e}")
        raise HTTPException(status_code=401, detail="Failed to authenticate with Tidal. Please log in again.")
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
    
    # Initialize progress tracking
    update_progress(
        transfer_id, "running", "Starting song transfer", 0,
        current_operation="liking", total_songs=len(request.tracks)
    )
    
    for i, track_data in enumerate(request.tracks):
        try:
            # Update progress with current song
            progress_percent = int((i / len(request.tracks)) * 100)
            update_progress(
                transfer_id, "running", f"Processing song {i+1} of {len(request.tracks)}", 
                progress_percent, current_song=track_data.name,
                songs_processed=i, total_songs=len(request.tracks),
                songs_successful=liked_count, songs_failed=len(failed_tracks),
                current_operation="liking"
            )
            
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
    
    # Final progress update
    update_progress(
        transfer_id, "completed", "Song transfer completed", 100,
        songs_processed=len(request.tracks), total_songs=len(request.tracks),
        songs_successful=liked_count, songs_failed=len(failed_tracks),
        current_operation="completed"
    )
    
    
    result_msg = f"Successfully liked {liked_count}/{len(request.tracks)} songs."
    print(f"✓ Song liking completed: {result_msg}")
    
    response_data = {
        "status": "success", 
        "message": result_msg,
        "failed": failed_tracks,
        "success_count": liked_count,
        "total_count": len(request.tracks),
        "transfer_id": transfer_id  # Return transfer_id so frontend can get failure report
    }
    
    print(f"📤 Sending songs response: {response_data}")
    
    # Add headers to prevent caching issues on mobile
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    
    return response_data

@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest, authorization: str = Header(...), response: Response = None):
    """Add albums to Tidal favorites with proper failure tracking."""
    print(f"📥 Album transfer request received: {len(request.albums)} albums")
    
    try:
        token = authorization.split(" ")[1]
        tidal_session = get_tidal_session(token)
    except HTTPException as e:
        # Token validation failed
        print(f"❌ Token validation failed: {e.detail}")
        raise e
    except Exception as e:
        print(f"❌ Failed to get Tidal session: {e}")
        raise HTTPException(status_code=401, detail="Failed to authenticate with Tidal. Please log in again.")
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
    
    # Initialize progress tracking
    update_progress(
        transfer_id, "running", "Starting album transfer", 0,
        current_operation="adding_albums", total_songs=len(request.albums)
    )
    
    for i, album_data in enumerate(request.albums):
        try:
            # Update progress with current album
            progress_percent = int((i / len(request.albums)) * 100)
            update_progress(
                transfer_id, "running", f"Processing album {i+1} of {len(request.albums)}", 
                progress_percent, current_song=album_data.name,
                songs_processed=i, total_songs=len(request.albums),
                songs_successful=added_count, songs_failed=len(failed_albums),
                current_operation="adding_albums"
            )
            
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
    
    # Final progress update
    update_progress(
        transfer_id, "completed", "Album transfer completed", 100,
        songs_processed=len(request.albums), total_songs=len(request.albums),
        songs_successful=added_count, songs_failed=len(failed_albums),
        current_operation="completed"
    )
    
    
    result_msg = f"Successfully added {added_count}/{len(request.albums)} albums."
    print(f"✓ Album adding completed: {result_msg}")
    
    response_data = {
        "status": "success", 
        "message": result_msg,
        "failed": failed_albums,
        "success_count": added_count,
        "total_count": len(request.albums),
        "transfer_id": transfer_id  # Return transfer_id so frontend can get failure report
    }
    
    print(f"📤 Sending album response: {response_data}")
    
    # Add headers to prevent caching issues on mobile
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    
    return response_data

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
                error_str = str(e)
                print(f"❌ Failed to process playlist '{playlist_name}': {error_str}")
                
                # Provide more specific error messages for common issues
                if "Load failed" in error_str or "load failed" in error_str.lower():
                    error_msg = f"Failed to load playlist data for '{playlist_name}'. This may be due to network issues or Tidal API limitations."
                elif "timeout" in error_str.lower():
                    error_msg = f"Timeout while processing playlist '{playlist_name}'. Please try again."
                elif "unauthorized" in error_str.lower() or "401" in error_str:
                    error_msg = f"Authentication expired while processing playlist '{playlist_name}'. Please log in to Tidal again."
                elif "rate limit" in error_str.lower() or "429" in error_str:
                    error_msg = f"Rate limit exceeded while processing playlist '{playlist_name}'. Please wait and try again."
                else:
                    error_msg = f"Failed to create playlist '{playlist_name}': {error_str}"
                
                playlist_failures[playlist_name] = [error_msg]
            
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
        # Provide more specific error messages
        error_str = str(e)
        if "Load failed" in error_str or "load failed" in error_str.lower():
            error_msg = "Transfer failed: Unable to load playlist data. This may be due to network issues or Tidal API limitations."
        elif "timeout" in error_str.lower():
            error_msg = "Transfer failed: Request timeout. Please try again with fewer playlists or check your internet connection."
        elif "unauthorized" in error_str.lower() or "401" in error_str:
            error_msg = "Transfer failed: Authentication expired. Please log in to Tidal again."
        elif "rate limit" in error_str.lower() or "429" in error_str:
            error_msg = "Transfer failed: Rate limit exceeded. Please wait a few minutes and try again."
        else:
            error_msg = f"Transfer failed: {error_str}"
        
        print(f"❌ BACKGROUND TASK ERROR: {error_msg}")
        print(f"❌ Original error: {error_str}")
        
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
    try:
        token = authorization.split(" ")[1]
        # Validate token before starting background task
        get_tidal_session(token)
    except HTTPException as e:
        # Token validation failed
        print(f"❌ Token validation failed: {e.detail}")
        raise e
    except Exception as e:
        print(f"❌ Failed to get Tidal session: {e}")
        raise HTTPException(status_code=401, detail="Failed to authenticate with Tidal. Please log in again.")
    
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

# --- Unified Transfer Endpoint ---
@app.post("/api/transfer/unified")
async def unified_transfer_to_tidal(request: UnifiedTransferRequest, background_tasks: BackgroundTasks, authorization: str = Header(...)):
    """Unified transfer endpoint that processes songs, albums, and playlists sequentially."""
    try:
        token = authorization.replace("Bearer ", "")
        tidal_session = get_tidal_session(token)
    except HTTPException as e:
        print(f"❌ Token validation failed: {e.detail}")
        raise e
    except Exception as e:
        print(f"❌ Failed to get Tidal session: {e}")
        raise HTTPException(status_code=401, detail="Failed to authenticate with Tidal. Please log in again.")
    
    # Generate a unified transfer ID
    transfer_id = str(uuid.uuid4())
    
    # Initialize failure report for this unified operation
    failure_reports[transfer_id] = {
        "platform": "Tidal",
        "failed_songs": [],
        "failed_albums": [],
        "failed_playlists": {},
        "total_failures": 0
    }
    
    # Start the unified transfer process in the background
    background_tasks.add_task(
        run_unified_transfer_process_async,
        token,
        request.tracks,
        request.albums,
        request.playlists,
        transfer_id
    )
    
    return {
        "status": "success",
        "message": "Unified transfer initiated",
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
        # Also clean up failure reports to prevent memory leaks
        if transfer_id in failure_reports:
            del failure_reports[transfer_id]
        raise HTTPException(status_code=404, detail="Transfer expired")
    
    return ProgressResponse(
        transfer_id=transfer_id,
        status=progress["status"],
        current_step=progress["current_step"],
        progress_percent=progress["progress_percent"],
        completed_playlists=progress["completed_playlists"],
        total_playlists=progress["total_playlists"],
        current_playlist=progress.get("current_playlist"),
        current_song=progress.get("current_song"),
        songs_processed=progress.get("songs_processed"),
        total_songs=progress.get("total_songs"),
        songs_successful=progress.get("songs_successful"),
        songs_failed=progress.get("songs_failed"),
        current_operation=progress.get("current_operation")
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

@app.post("/api/cleanup")
async def trigger_cleanup():
    """Trigger cleanup of old data to prevent memory leaks."""
    try:
        # Clean up old pending logins
        expired_logins = await cleanup_old_pending_logins()
        
        # Clean up old transfer progress (older than 2 hours)
        current_time = time.time()
        expired_transfers = []
        for transfer_id, progress in transfer_progress.items():
            if current_time - progress.get("last_updated", 0) > 7200:  # 2 hours
                expired_transfers.append(transfer_id)
        
        for transfer_id in expired_transfers:
            del transfer_progress[transfer_id]
            if transfer_id in failure_reports:
                del failure_reports[transfer_id]
        
        # Clean up cache
        cache_cleaned = cleanup_caches()
        
        return {
            "status": "success",
            "expired_logins": expired_logins,
            "expired_transfers": len(expired_transfers),
            "cache_cleaned": cache_cleaned,
            "message": f"Cleaned up {expired_logins} expired logins, {len(expired_transfers)} expired transfers"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
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
            "progress": "/api/transfer/progress/{transfer_id}",
            "validate_token": "/api/validate-tidal-token"
        }
    }

@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": "2.0"
    }

@app.post("/api/validate-tidal-token")
async def validate_tidal_token(authorization: str = Header(...)):
    """Validate Tidal token endpoint for debugging."""
    try:
        token = authorization.split(" ")[1]
        tidal_session = get_tidal_session(token)
        
        # Get user info to confirm token is working
        user = tidal_session.user
        return {
            "status": "valid",
            "user_id": user.id if hasattr(user, 'id') else None,
            "message": "Token is valid and working"
        }
    except HTTPException as e:
        return {
            "status": "invalid",
            "error": e.detail,
            "status_code": e.status_code
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Unexpected error during token validation"
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


# --- Unified Transfer Process Function ---
async def run_unified_transfer_process_async(token: str, tracks: List[dict], albums: List[dict], playlists: List[dict], transfer_id: str):
    """Unified transfer process that handles songs, albums, and playlists sequentially."""
    try:
        print(f"🎵 Starting unified transfer process: {transfer_id}")
        tidal_session = get_tidal_session(token)
        config_obj, config_dict = get_tidal_config()
        
        # Calculate total operations
        total_operations = 0
        if tracks: total_operations += 1
        if albums: total_operations += 1
        if playlists: total_operations += 1
        
        current_operation = 0
        
        # Initialize cache entry for unified transfer
        failure_cache.create_transfer_report(
            transfer_id=transfer_id,
            platform="Tidal",
            total_songs=len(tracks),
            total_albums=len(albums),
            total_playlists=len(playlists)
        )
        
        # Initialize progress
        update_progress(
            transfer_id, "running", "Starting unified transfer", 0,
            current_operation=0, total_songs=len(tracks) + len(albums) + sum(len(p.tracks) if p.tracks else 0 for p in playlists)
        )
        
        # 1. Process Songs (if any)
        if tracks:
            current_operation += 1
            print(f"🔄 Processing {len(tracks)} songs...")
            update_progress(
                transfer_id, "running", f"Processing {len(tracks)} songs", 
                int((current_operation - 1) / total_operations * 100),
                current_operation=current_operation, total_songs=len(tracks),
                songs_processed=0, songs_successful=0, songs_failed=0
            )
            
            liked_count = 0
            failed_tracks = []
            
            for i, track_data in enumerate(tracks):
                try:
                    # Update progress with current song
                    progress_percent = int((current_operation - 1) / total_operations * 100 + (i / len(tracks)) / total_operations * 100)
                    update_progress(
                        transfer_id, "running", f"Liking song {i+1} of {len(tracks)}", 
                        progress_percent, current_song=track_data.name,
                        songs_processed=i, total_songs=len(tracks),
                        songs_successful=liked_count, songs_failed=len(failed_tracks),
                        current_operation="liking"
                    )
                    
                    # Convert Pydantic model to dict for the search function
                    track_dict = track_data.dict()
                    tidal_track = await tidal_search_single(track_dict, tidal_session)
                    
                    if tidal_track:
                        await asyncio.to_thread(tidal_session.user.favorites.add_track, str(tidal_track.id))
                        liked_count += 1
                        print(f"✓ Liked ({i+1}/{len(tracks)}): {track_data.name}")
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
            
            print(f"✓ Songs processing completed: {liked_count}/{len(tracks)} successful")
            
            # Update cache with failed songs
            if failed_tracks:
                failure_cache.update_transfer_failures(
                    transfer_id=transfer_id,
                    failed_songs=failed_tracks
                )
        
        # 2. Process Albums (if any)
        if albums:
            current_operation += 1
            print(f"🔄 Processing {len(albums)} albums...")
            update_progress(
                transfer_id, "running", f"Processing {len(albums)} albums", 
                int((current_operation - 1) / total_operations * 100),
                current_operation=current_operation, total_songs=len(albums),
                songs_processed=0, songs_successful=0, songs_failed=0
            )
            
            added_count = 0
            failed_albums = []
            
            for i, album_data in enumerate(albums):
                try:
                    # Update progress with current album
                    progress_percent = int((current_operation - 1) / total_operations * 100 + (i / len(albums)) / total_operations * 100)
                    update_progress(
                        transfer_id, "running", f"Adding album {i+1} of {len(albums)}", 
                        progress_percent, current_song=album_data.name,
                        songs_processed=i, total_songs=len(albums),
                        songs_successful=added_count, songs_failed=len(failed_albums),
                        current_operation="adding_albums"
                    )
                    
                    artist_name = album_data.artists[0].name if album_data.artists else 'Unknown'
                    query = f"{album_data.name} {artist_name}"
                    search_results = await asyncio.to_thread(
                        tidal_session.search, query, models=[tidalapi.album.Album]
                    )
                    
                    if search_results['albums']:
                        tidal_album_id = search_results['albums'][0].id
                        await asyncio.to_thread(tidal_session.user.favorites.add_album, str(tidal_album_id))
                        added_count += 1
                        print(f"✓ Added ({i+1}/{len(albums)}): {album_data.name}")
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
            
            print(f"✓ Albums processing completed: {added_count}/{len(albums)} successful")
            
            # Update cache with failed albums
            if failed_albums:
                failure_cache.update_transfer_failures(
                    transfer_id=transfer_id,
                    failed_albums=failed_albums
                )
        
        # 3. Process Playlists (if any)
        if playlists:
            current_operation += 1
            print(f"🔄 Processing {len(playlists)} playlists...")
            update_progress(
                transfer_id, "running", f"Processing {len(playlists)} playlists", 
                int((current_operation - 1) / total_operations * 100),
                current_operation=current_operation, total_songs=len(playlists),
                songs_processed=0, songs_successful=0, songs_failed=0
            )
            
            playlist_failures = {}
            successful_playlists = 0
            
            for i, playlist_data in enumerate(playlists):
                playlist_name = playlist_data.name
                track_count = len(playlist_data.tracks) if playlist_data.tracks else 0
                
                print(f"🔄 Processing playlist {i+1}/{len(playlists)}: {playlist_name}")
                
                # Update progress
                progress_percent = int((current_operation - 1) / total_operations * 100 + (i / len(playlists)) / total_operations * 100)
                update_progress(
                    transfer_id, "running", f"Processing playlist: {playlist_name}", 
                    progress_percent, current_playlist=playlist_name,
                    completed_playlists=i, total_playlists=len(playlists),
                    current_operation="playlists"
                )
                
                try:
                    # Convert Pydantic model to dict for the sync function
                    playlist_dict = playlist_data.dict()
                    await sync_playlist(tidal_session, playlist_dict, config_dict)
                    successful_playlists += 1
                    print(f"✓ Playlist '{playlist_name}' processed successfully")
                except Exception as e:
                    print(f"✗ Failed to process playlist '{playlist_name}': {e}")
                    playlist_failures[playlist_name] = [f"Playlist processing failed: {str(e)}"]
                    failure_reports[transfer_id]["failed_playlists"][playlist_name] = playlist_failures[playlist_name]
            
            print(f"✓ Playlists processing completed: {successful_playlists}/{len(playlists)} successful")
            
            # Update cache with failed playlists
            if playlist_failures:
                failure_cache.update_transfer_failures(
                    transfer_id=transfer_id,
                    failed_playlists=playlist_failures
                )
        
        # Update total failures count
        total_failures = (
            len(failure_reports[transfer_id]["failed_songs"]) + 
            len(failure_reports[transfer_id]["failed_albums"]) + 
            sum(len(tracks) for tracks in failure_reports[transfer_id]["failed_playlists"].values())
        )
        failure_reports[transfer_id]["total_failures"] = total_failures
        
        # Mark transfer as completed in cache
        failure_cache.complete_transfer_report(
            transfer_id=transfer_id,
            status="completed"
        )
        
        # Final progress update
        update_progress(
            transfer_id, "completed", "Unified transfer completed", 100,
            current_operation="completed",
            songs_processed=len(tracks) + len(albums) + sum(len(p.tracks) if p.tracks else 0 for p in playlists),
            total_songs=len(tracks) + len(albums) + sum(len(p.tracks) if p.tracks else 0 for p in playlists),
            songs_successful=len(tracks) + len(albums) + len(playlists) - total_failures,
            songs_failed=total_failures
        )
        
        print(f"✓ Unified transfer process completed: {transfer_id}")
        
    except Exception as e:
        print(f"❌ Unified transfer process failed: {transfer_id} - {e}")
        
        # Mark transfer as failed in cache
        failure_cache.complete_transfer_report(
            transfer_id=transfer_id,
            status="failed"
        )
        
        update_progress(transfer_id, "failed", f"Transfer failed: {str(e)}", 0)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting FuckSpotify API server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)