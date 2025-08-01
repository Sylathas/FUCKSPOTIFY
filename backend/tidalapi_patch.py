import asyncio
import math
from typing import List
import tidalapi
from tqdm import tqdm
from tqdm.asyncio import tqdm as atqdm
import requests
import mimetypes
import os
from typing import Optional

def _remove_indices_from_playlist(playlist: tidalapi.UserPlaylist, indices: List[int]):
    headers = {'If-None-Match': playlist._etag}
    index_string = ",".join(map(str, indices))
    playlist.request.request('DELETE', (playlist._base_url + '/items/%s') % (playlist.id, index_string), headers=headers)
    playlist._reparse()

def clear_tidal_playlist(playlist: tidalapi.UserPlaylist, chunk_size: int=20):
    with tqdm(desc="Erasing existing tracks from Tidal playlist", total=playlist.num_tracks) as progress:
        while playlist.num_tracks:
            indices = range(min(playlist.num_tracks, chunk_size))
            _remove_indices_from_playlist(playlist, indices)
            progress.update(len(indices))
    
def add_multiple_tracks_to_playlist(playlist: tidalapi.UserPlaylist, track_ids: List[int], chunk_size: int=20):
    offset = 0
    with tqdm(desc="Adding new tracks to Tidal playlist", total=len(track_ids)) as progress:
        while offset < len(track_ids):
            count = min(chunk_size, len(track_ids) - offset)
            playlist.add(track_ids[offset:offset+chunk_size])
            offset += count
            progress.update(count)

async def _get_all_chunks(url, session, parser, params={}) -> List[tidalapi.Track]:
    """ 
        Helper function to get all items from a Tidal endpoint in parallel
        The main library doesn't provide the total number of items or expose the raw json, so use this wrapper instead
    """
    def _make_request(offset: int=0):
        new_params = params
        new_params['offset'] = offset
        return session.request.map_request(url, params=new_params)

    first_chunk_raw = _make_request()
    limit = first_chunk_raw['limit']
    total = first_chunk_raw['totalNumberOfItems']
    items = session.request.map_json(first_chunk_raw, parse=parser)

    if len(items) < total:
        offsets = [limit * n for n in range(1, math.ceil(total/limit))]
        extra_results = await atqdm.gather(
                *[asyncio.to_thread(lambda offset: session.request.map_json(_make_request(offset), parse=parser), offset) for offset in offsets],
            desc="Fetching additional data chunks"
        )
        for extra_result in extra_results:
            items.extend(extra_result)
    return items

async def get_all_favorites(favorites: tidalapi.Favorites, order: str = "NAME", order_direction: str = "ASC", chunk_size: int=100) -> List[tidalapi.Track]:
    """ Get all favorites from Tidal playlist in chunks """
    params = {
        "limit": chunk_size,
        "order": order,
        "orderDirection": order_direction,
    }
    return await _get_all_chunks(f"{favorites.base_url}/tracks", session=favorites.session, parser=favorites.session.parse_track, params=params)

async def get_all_playlists(user: tidalapi.User, chunk_size: int=10) -> List[tidalapi.Playlist]:
    """ Get all user playlists from Tidal in chunks """
    print(f"Loading playlists from Tidal user")
    params = {
        "limit": chunk_size,
    }
    return await _get_all_chunks(f"users/{user.id}/playlists", session=user.session, parser=user.playlist.parse_factory, params=params)

async def get_all_playlist_tracks(playlist: tidalapi.Playlist, chunk_size: int=20) -> List[tidalapi.Track]:
    """ Get all tracks from Tidal playlist in chunks """
    params = {
        "limit": chunk_size,
    }
    print(f"Loading tracks from Tidal playlist '{playlist.name}'")
    return await _get_all_chunks(f"{playlist._base_url%playlist.id}/tracks", session=playlist.session, parser=playlist.session.parse_track, params=params)

def upload_playlist_cover_art(playlist: 'tidalapi.Playlist', image_path: str) -> bool:
    """
    Upload cover art to a Tidal playlist.
    
    Args:
        playlist: The Tidal playlist object
        image_path: Path to the image file to upload
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Check if file exists and get mime type
        if not os.path.exists(image_path):
            print(f"❌ Image file not found: {image_path}")
            return False
            
        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type or not mime_type.startswith('image/'):
            print(f"❌ Invalid image file type: {mime_type}")
            return False
            
        # Get file size
        file_size = os.path.getsize(image_path)
        if file_size > 5 * 1024 * 1024:  # 5MB limit
            print(f"❌ Image file too large: {file_size} bytes")
            return False
            
        # Get session from playlist
        session = playlist.session
        if not session or not session.check_login():
            print("❌ Invalid or expired Tidal session")
            return False
            
        # Prepare upload URL - this may need adjustment based on Tidal API
        upload_url = f"https://api.tidalhifi.com/v1/playlists/{playlist.id}/image"
        
        # Prepare headers
        headers = {
            'Authorization': f'Bearer {session.access_token}',
            'X-Tidal-Token': session.client_id if hasattr(session, 'client_id') else 'wc8j_yBJd20zOow'
        }
        
        # Read and upload the image
        with open(image_path, 'rb') as image_file:
            files = {
                'image': (os.path.basename(image_path), image_file, mime_type)
            }
            
            response = requests.post(
                upload_url,
                headers=headers,
                files=files,
                timeout=30
            )
            
        if response.status_code == 200:
            print(f"✅ Successfully uploaded cover art for playlist '{playlist.name}'")
            return True
        else:
            print(f"❌ Failed to upload cover art: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Exception during cover art upload: {e}")
        return False

def set_playlist_cover_from_url(playlist: 'tidalapi.Playlist', image_url: str) -> bool:
    """
    Download an image from URL and set it as playlist cover art.
    
    Args:
        playlist: The Tidal playlist object
        image_url: URL of the image to download and upload
        
    Returns:
        bool: True if successful, False otherwise
    """
    import tempfile
    from urllib.parse import urlparse
    
    try:
        print(f"🖼️  Downloading cover art from: {image_url[:50]}...")
        
        # Download the image
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        # Get file extension from URL or default to jpg
        parsed_url = urlparse(image_url)
        file_extension = os.path.splitext(parsed_url.path)[1] or '.jpg'
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            temp_file.write(response.content)
            temp_file_path = temp_file.name
        
        try:
            # Upload the temporary file
            success = upload_playlist_cover_art(playlist, temp_file_path)
            return success
        finally:
            # Always cleanup temp file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to download image: {e}")
        return False
    except Exception as e:
        print(f"❌ Exception during cover art processing: {e}")
        return False

def update_playlist_metadata(playlist: 'tidalapi.Playlist', 
                           name: Optional[str] = None,
                           description: Optional[str] = None) -> bool:
    """
    Update playlist metadata (name and/or description).
    
    Args:
        playlist: The Tidal playlist object
        name: New playlist name (optional)
        description: New playlist description (optional)
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        session = playlist.session
        if not session or not session.check_login():
            print("❌ Invalid or expired Tidal session")
            return False
            
        # Prepare update data
        update_data = {}
        if name is not None:
            update_data['title'] = name
        if description is not None:
            update_data['description'] = description
            
        if not update_data:
            print("⚠️  No metadata to update")
            return True
            
        # Prepare update URL
        update_url = f"https://api.tidalhifi.com/v1/playlists/{playlist.id}"
        
        # Prepare headers
        headers = {
            'Authorization': f'Bearer {session.access_token}',
            'X-Tidal-Token': session.client_id if hasattr(session, 'client_id') else 'wc8j_yBJd20zOow',
            'Content-Type': 'application/json'
        }
        
        response = requests.put(
            update_url,
            headers=headers,
            json=update_data,
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"✅ Successfully updated playlist metadata")
            return True
        else:
            print(f"❌ Failed to update playlist metadata: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Exception during playlist metadata update: {e}")
        return False