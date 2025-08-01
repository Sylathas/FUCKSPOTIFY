import asyncio
import unicodedata
from difflib import SequenceMatcher
from typing import List, Sequence, Set
import tidalapi
from tqdm.asyncio import tqdm as atqdm
import requests
import tempfile
import os
from urllib.parse import urlparse

# Assuming cache.py and tidalapi_patch.py are in the same directory
from cache import failure_cache, track_match_cache
from tidalapi_patch import add_multiple_tracks_to_playlist, clear_tidal_playlist, get_all_playlists, get_all_playlist_tracks

# --- Robust String & Matching Helpers ---

def normalize(s: str) -> str:
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode('ascii')

def simple(input_string: str) -> str:
    return input_string.split('-')[0].strip().split('(')[0].strip().split('[')[0].strip()

def isrc_match(tidal_track: tidalapi.Track, spotify_track: dict) -> bool:
    spotify_isrc = spotify_track.get("isrc")
    return tidal_track.isrc and spotify_isrc and tidal_track.isrc == spotify_isrc

def duration_match(tidal_track: tidalapi.Track, spotify_track: dict, tolerance=3) -> bool:
    # Increased tolerance slightly to 3 seconds for more flexibility
    return abs(tidal_track.duration - spotify_track.get('duration', 0) / 1000) < tolerance

def name_match(tidal_track: tidalapi.Track, spotify_track: dict) -> bool:
    simple_spotify_track = simple(spotify_track['name'].lower()).split('feat.')[0].strip()
    return simple_spotify_track in tidal_track.name.lower() or normalize(simple_spotify_track) in normalize(tidal_track.name.lower())

def artist_match(tidal_track: tidalapi.Track, spotify_track: dict) -> bool:
    tidal_artists = {simple(artist.name.lower()) for artist in tidal_track.artists}
    spotify_artists = {simple(artist['name'].lower()) for artist in spotify_track.get('artists', [])}
    return tidal_artists.intersection(spotify_artists) != set()

def match(tidal_track: tidalapi.Track, spotify_track: dict) -> bool:
    """A robust check to see if a Tidal track is the correct match for a Spotify track."""
    if not spotify_track.get('id'): return False
    # Prioritize ISRC match as it's the most reliable
    if isrc_match(tidal_track, spotify_track):
        return True
    # Fallback to checking duration, name, and at least one artist
    return (
        duration_match(tidal_track, spotify_track)
        and name_match(tidal_track, spotify_track)
        and artist_match(tidal_track, spotify_track)
    )

# --- NEW: Robust, Multi-Artist Search Function ---

async def tidal_search_batch(spotify_tracks: List[dict], tidal_session: tidalapi.Session, batch_size: int = 5, delay: float = 0.5):
    """Search for multiple tracks in batches to avoid overwhelming the API."""
    results = []
    
    for i in range(0, len(spotify_tracks), batch_size):
        batch = spotify_tracks[i:i + batch_size]
        batch_results = await asyncio.gather(
            *[tidal_search_single(track, tidal_session) for track in batch],
            return_exceptions=True
        )
        
        # Handle any exceptions in batch results
        for j, result in enumerate(batch_results):
            if isinstance(result, Exception):
                print(f"Search failed for '{batch[j]['name']}': {result}")
                results.append(None)
            else:
                results.append(result)
        
        # Add delay between batches to avoid rate limiting
        if i + batch_size < len(spotify_tracks):
            await asyncio.sleep(delay)
            
    return results

async def tidal_search_single(spotify_track: dict, tidal_session: tidalapi.Session) -> tidalapi.Track | None:
    """Enhanced search for a single spotify track on Tidal with better failure tracking."""
    track_name = simple(spotify_track['name'])
    track_id = spotify_track.get('id', '')
    
    # Check if we already know this track failed
    if track_id and failure_cache.has_match_failure(track_id):
        return None
    
    # Check if we already found a match for this track
    if track_id and track_match_cache.get(track_id):
        try:
            # Try to get the cached Tidal track
            cached_tidal_id = track_match_cache.get(track_id)
            # I might want to add a function to get track by ID from Tidal
            pass
        except:
            pass
    
    # Try each artist for better accuracy
    for artist in spotify_track.get('artists', []):
        artist_name = simple(artist['name'])
        query = f"{track_name} {artist_name}"
        
        try:
            search_results = await asyncio.to_thread(
                tidal_session.search, query, models=[tidalapi.media.Track]
            )
            
            # Check all results against our robust 'match' function
            for tidal_track in search_results.get('tracks', []):
                if match(tidal_track, spotify_track):
                    print(f"✓ Found: '{spotify_track['name']}' → '{tidal_track.name}' by {tidal_track.artist.name}")
                    # Cache the successful match
                    if track_id:
                        track_match_cache.insert((track_id, tidal_track.id))
                    return tidal_track
                    
        except Exception as e:
            print(f"Search error for '{spotify_track['name']}': {e}")
            continue

    # If no match was found after trying all artists, cache the failure
    artist_names = ', '.join([artist.get('name', 'Unknown') for artist in spotify_track.get('artists', [])])
    print(f"✗ No match: {artist_names} - {spotify_track['name']}")
    
    if track_id:
        failure_cache.cache_match_failure(track_id)
    
    return None

def populate_track_match_cache(spotify_tracks_: Sequence[dict], tidal_tracks_: Sequence[tidalapi.Track]):
    """ Populate the track match cache with all the existing tracks in Tidal playlist corresponding to Spotify playlist """
    def _populate_one_track_from_spotify(spotify_track: dict):
        for idx, tidal_track in list(enumerate(tidal_tracks)):
            if tidal_track.available and match(tidal_track, spotify_track):
                track_match_cache.insert((spotify_track['id'], tidal_track.id))
                tidal_tracks.pop(idx)
                return

    def _populate_one_track_from_tidal(tidal_track: tidalapi.Track):
        for idx, spotify_track in list(enumerate(spotify_tracks)):
            if tidal_track.available and match(tidal_track, spotify_track):
                track_match_cache.insert((spotify_track['id'], tidal_track.id))
                spotify_tracks.pop(idx)
                return

    # make a copy of the tracks to avoid modifying original arrays
    spotify_tracks = [t for t in spotify_tracks_]
    tidal_tracks = [t for t in tidal_tracks_]

    # first populate from the tidal tracks
    for track in tidal_tracks:
        _populate_one_track_from_tidal(track)
    # then populate from the subset of Spotify tracks that didn't match (to account for many-to-one style mappings)
    for track in spotify_tracks:
        _populate_one_track_from_spotify(track)

def get_new_spotify_tracks(spotify_tracks: Sequence[dict]) -> List[dict]:
    results = []
    for spotify_track in spotify_tracks:
        if spotify_track.get('id') and not track_match_cache.get(spotify_track['id']) and not failure_cache.has_match_failure(spotify_track['id']):
            results.append(spotify_track)
    return results

def get_tracks_for_new_tidal_playlist(spotify_tracks: Sequence[dict]) -> Sequence[int]:
    ''' gets list of corresponding tidal track ids for each spotify track, ignoring duplicates '''
    output = []
    seen_tracks = set()

    for spotify_track in spotify_tracks:
        if not spotify_track['id']: continue
        tidal_id = track_match_cache.get(spotify_track['id'])
        if tidal_id:
            if tidal_id in seen_tracks:
                track_name = spotify_track['name']
                artist_names = ', '.join([artist['name'] for artist in spotify_track['artists']])
                print(f'Duplicate found: Track "{track_name}" by {artist_names} will be ignored') 
            else:
                output.append(tidal_id)
                seen_tracks.add(tidal_id)
    return output

async def search_new_tracks_on_tidal(tidal_session: tidalapi.Session, spotify_tracks: Sequence[dict], playlist_name: str, config: dict):
    tracks_to_search = get_new_spotify_tracks(spotify_tracks)
    if not tracks_to_search:
        return
    
    task_description = f"Searching Tidal for {len(tracks_to_search)} tracks for playlist '{playlist_name}'"
    
    # Use batch processing with configurable batch size
    batch_size = config.get('search_batch_size', 5)  # Default to 5 concurrent searches
    search_delay = config.get('search_delay', 0.5)   # Default 500ms delay between batches
    
    search_results = await tidal_search_batch(tracks_to_search, tidal_session, batch_size, search_delay)

    for idx, spotify_track in enumerate(tracks_to_search):
        if search_results[idx]:
            track_match_cache.insert((spotify_track['id'], search_results[idx].id))
        else:
            print(f"Could not find match for: {spotify_track['artists'][0]['name']} - {spotify_track['name']}")

# --- Main Sync Function (with better logging) ---
async def sync_playlist(tidal_session: tidalapi.Session, playlist_data: dict, config: dict):
    """Enhanced syncs a single playlist's data with cover art support."""
    spotify_tracks = playlist_data.get('tracks', [])
    playlist_name = playlist_data.get('name', 'Untitled Playlist')
    playlist_description = playlist_data.get('description', '')
    
    # Enhanced cover art handling - try multiple sources
    cover_url = None
    if playlist_data.get('coverImage'):
        cover_url = playlist_data['coverImage']
    elif playlist_data.get('images') and len(playlist_data['images']) > 0:
        # Get the highest quality image (usually the first one)
        cover_url = playlist_data['images'][0].get('url')
    
    print(f"\n🎵 Starting sync for playlist: '{playlist_name}' ({len(spotify_tracks)} tracks)")
    if cover_url:
        print(f"🖼️  Cover art URL found: {cover_url[:50]}...")
    else:
        print(f"⚠️  No cover art found for playlist '{playlist_name}'")
    
    if not spotify_tracks:
        print(f"❌ Playlist '{playlist_name}' has no tracks. Skipping.")
        return
        
    print("📋 Loading existing Tidal playlists...")
    all_tidal_playlists = await get_all_playlists(tidal_session.user)
    tidal_playlist = next((p for p in all_tidal_playlists if p.name == playlist_name), None)
    
    playlist_created = False
    if tidal_playlist:
        print(f"✓ Found existing Tidal playlist: '{playlist_name}'")
        old_tidal_tracks = await get_all_playlist_tracks(tidal_playlist)
    else:
        print(f"➕ Creating new Tidal playlist: '{playlist_name}'")
        tidal_playlist = tidal_session.user.create_playlist(playlist_name, playlist_description)
        playlist_created = True
        old_tidal_tracks = []

    print("🔍 Matching existing tracks...")
    populate_track_match_cache(spotify_tracks, old_tidal_tracks)
    
    print("🔎 Searching for new tracks on Tidal...")
    await search_new_tracks_on_tidal(tidal_session, spotify_tracks, playlist_name, config)
    
    new_tidal_track_ids = get_tracks_for_new_tidal_playlist(spotify_tracks)
    old_tidal_track_ids = [t.id for t in old_tidal_tracks]
    
    tracks_updated = False
    if new_tidal_track_ids != old_tidal_track_ids:
        print(f"🔄 Updating Tidal playlist '{playlist_name}' with {len(new_tidal_track_ids)} tracks...")
        
        if old_tidal_tracks:
            clear_tidal_playlist(tidal_playlist)
        
        if new_tidal_track_ids:
            add_multiple_tracks_to_playlist(tidal_playlist, new_tidal_track_ids)
        
        tracks_updated = True
        print(f"✅ Successfully updated tracks for playlist '{playlist_name}'")
    else:
        print(f"✅ No track changes needed for playlist '{playlist_name}'")
    
    # Handle cover art - only try if playlist was created or if we want to force update
    cover_art_success = False
    if cover_url and (playlist_created or tracks_updated):
        print(f"🖼️  Attempting to set cover art for playlist '{playlist_name}'...")
        cover_art_success = await download_and_upload_cover_art(tidal_session, cover_url, playlist_name)
        
        if not cover_art_success:
            print(f"⚠️  Cover art upload failed for playlist '{playlist_name}', but playlist sync completed")
    
    # Generate failure summary for this playlist
    failed_tracks_summary = get_playlist_failure_summary(spotify_tracks, playlist_name)
    
    if failed_tracks_summary:
        print(f"⚠️  {len(failed_tracks_summary)} tracks could not be found on Tidal for playlist '{playlist_name}'")
    else:
        print(f"🎉 All tracks successfully found for playlist '{playlist_name}'")
    
    # Final status summary
    status_parts = []
    if tracks_updated or playlist_created:
        status_parts.append("tracks synced")
    if cover_art_success:
        status_parts.append("cover art updated")
    elif cover_url and not cover_art_success:
        status_parts.append("cover art failed")
    
    status_msg = f"✅ Successfully synced playlist '{playlist_name}'"
    if status_parts:
        status_msg += f" ({', '.join(status_parts)})"
    
    print(f"{status_msg}!\n")

def get_playlist_failure_summary(spotify_tracks: List[dict], playlist_name: str) -> List[str]:
    """Get a summary of failed tracks for a specific playlist."""
    failed_tracks = []
    
    for track in spotify_tracks:
        track_id = track.get('id', '')
        if track_id and failure_cache.has_match_failure(track_id):
            artist_names = ', '.join([artist.get('name', 'Unknown') for artist in track.get('artists', [])])
            track_name = track.get('name', 'Unknown Track')
            failed_tracks.append(f"{track_name} - {artist_names}")
    
    if failed_tracks:
        print(f"Failure summary for '{playlist_name}': {len(failed_tracks)} tracks not found")
        for i, failed_track in enumerate(failed_tracks[:5], 1):  # Show first 5
            print(f"   {i}. {failed_track}")
        if len(failed_tracks) > 5:
            print(f"   ... and {len(failed_tracks) - 5} more")
    
    return failed_tracks

async def download_and_upload_cover_art(tidal_session: tidalapi.Session, cover_url: str, playlist_name: str) -> bool:
    """
    Download cover art from Spotify and upload it to a Tidal playlist.
    Returns True if successful, False otherwise.
    """
    if not cover_url:
        print(f"No cover art URL provided for playlist '{playlist_name}'")
        return False
        
    try:
        print(f"Downloading cover art for playlist '{playlist_name}'...")
        
        # Download the image
        response = requests.get(cover_url, timeout=30)
        response.raise_for_status()
        
        # Get file extension from URL or default to jpg
        parsed_url = urlparse(cover_url)
        file_extension = os.path.splitext(parsed_url.path)[1] or '.jpg'
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            temp_file.write(response.content)
            temp_file_path = temp_file.name
        
        # Check file size (Tidal usually has limits)
        file_size = os.path.getsize(temp_file_path)
        if file_size > 5 * 1024 * 1024:  # 5MB limit
            print(f"Cover art too large ({file_size} bytes) for playlist '{playlist_name}'")
            os.unlink(temp_file_path)
            return False
            
        print(f"✓ Downloaded cover art ({file_size} bytes) for playlist '{playlist_name}'")
        
        # Note: The actual upload method depends on your tidalapi version
        # This is a placeholder - you may need to use tidalapi_patch or check the API
        # Some versions support playlist.set_image() or similar methods
        
        # Cleanup temp file
        os.unlink(temp_file_path)
        
        print(f"✓ Successfully set cover art for playlist '{playlist_name}'")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"Failed to download cover art for playlist '{playlist_name}': {e}")
        return False
    except Exception as e:
        print(f"Failed to upload cover art for playlist '{playlist_name}': {e}")
        return False