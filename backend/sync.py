import asyncio
import unicodedata
from difflib import SequenceMatcher
from typing import List, Sequence, Set
import tidalapi
from tqdm.asyncio import tqdm as atqdm

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

async def tidal_search(spotify_track: dict, tidal_session: tidalapi.Session) -> tidalapi.Track | None:
    """Searches for a spotify track on Tidal, trying each artist for better accuracy."""
    track_name = simple(spotify_track['name'])
    
    # Iterate through each artist listed on Spotify for the track
    for artist in spotify_track.get('artists', []):
        artist_name = simple(artist['name'])
        query = f"{track_name} {artist_name}"
        
        # Search Tidal with the constructed query
        search_results = await asyncio.to_thread(
            tidal_session.search, query, models=[tidalapi.media.Track]
        )
        
        # Check all results against our robust 'match' function
        for tidal_track in search_results['tracks']:
            if match(tidal_track, spotify_track):
                print(f"Found match for '{spotify_track['name']}': '{tidal_track.name}' by {tidal_track.artist.name}")
                return tidal_track # Return the first good match

    # If no match was found after trying all artists
    print(f"Could not find match for: {spotify_track['artists'][0]['name']} - {spotify_track['name']}")
    failure_cache.cache_match_failure(spotify_track['id'])
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
    
    search_results = await atqdm.gather(
        *[tidal_search(track, tidal_session) for track in tracks_to_search],
        desc=task_description
    )

    for idx, spotify_track in enumerate(tracks_to_search):
        if search_results[idx]:
            track_match_cache.insert((spotify_track['id'], search_results[idx].id))
        else:
            print(f"Could not find match for: {spotify_track['artists'][0]['name']} - {spotify_track['name']}")

# --- Main Sync Function ---

async def sync_playlist(tidal_session: tidalapi.Session, playlist_data: dict, config: dict):
    """Syncs a single playlist's data (received from the frontend) to Tidal."""
    spotify_tracks = playlist_data.get('tracks', [])
    playlist_name = playlist_data.get('name', 'Untitled Playlist')
    playlist_description = playlist_data.get('description', '')
    
    if not spotify_tracks:
        print(f"Playlist '{playlist_name}' has no tracks. Skipping.")
        return
        
    all_tidal_playlists = await get_all_playlists(tidal_session.user)
    tidal_playlist = next((p for p in all_tidal_playlists if p.name == playlist_name), None)
    
    if tidal_playlist:
        print(f"Found existing Tidal playlist: '{playlist_name}'")
        old_tidal_tracks = await get_all_playlist_tracks(tidal_playlist)
    else:
        print(f"Creating new Tidal playlist: '{playlist_name}'")
        tidal_playlist = tidal_session.user.create_playlist(playlist_name, playlist_description)
        old_tidal_tracks = []

    populate_track_match_cache(spotify_tracks, old_tidal_tracks)
    await search_new_tracks_on_tidal(tidal_session, spotify_tracks, playlist_name, config)
    new_tidal_track_ids = get_tracks_for_new_tidal_playlist(spotify_tracks)

    old_tidal_track_ids = [t.id for t in old_tidal_tracks]
    if new_tidal_track_ids == old_tidal_track_ids:
        print(f"No changes for Tidal playlist '{playlist_name}'")
        return

    print(f"Updating Tidal playlist '{playlist_name}' with {len(new_tidal_track_ids)} tracks.")
    clear_tidal_playlist(tidal_playlist)
    add_multiple_tracks_to_playlist(tidal_playlist, new_tidal_track_ids)