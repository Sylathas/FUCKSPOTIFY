import yaml
import asyncio
import uuid
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import tidalapi

# Import library functions
from sync import sync_playlist, tidal_search

# --- In-memory store for pending logins ---
# A simple dictionary to hold login futures. In a larger app, you'd use a database like Redis.
pending_logins: Dict[str, tidalapi.OAuth2LoginFuture] = {}

# --- Pydantic Models (No changes here) ---
class SpotifyTrack(BaseModel):
    id: str
    name: str
    # ... include all fields from your types.ts

class SpotifyPlaylist(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    tracks: Optional[List[SpotifyTrack]] = []
    # ... include all fields from your types.ts

class SpotifyAlbum(BaseModel):
    id: str
    name: str
    # ... include all fields from your types.ts

# --- API Request/Response Models ---
class LoginInitResponse(BaseModel):
    login_url: str
    poll_key: str

class LoginVerifyRequest(BaseModel):
    poll_key: str

class LoginVerifyResponse(BaseModel):
    status: str
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None

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
    allow_origins=["*"], # Change to your Netlify URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- NEW AUTHENTICATION ENDPOINTS ---

@app.get("/api/tidal/initiate-login", response_model=LoginInitResponse)
def initiate_tidal_login():
    """Starts the Tidal device login flow and returns a URL for the user."""
    session = tidalapi.Session()
    login, future = session.login_oauth()
    
    poll_key = str(uuid.uuid4()) # Generate a unique key for this login attempt
    pending_logins[poll_key] = future
    
    return {"login_url": login.verification_uri_complete, "poll_key": poll_key}

@app.post("/api/tidal/verify-login", response_model=LoginVerifyResponse)
async def verify_tidal_login(request: LoginVerifyRequest):
    """Checks if the user has completed the login flow."""
    future = pending_logins.get(request.poll_key)
    if not future:
        raise HTTPException(status_code=404, detail="Invalid poll key.")

    if future.done():
        session_data = future.result()
        del pending_logins[request.poll_key] # Clean up
        return {
            "status": "completed",
            "access_token": session_data.access_token,
            "refresh_token": session_data.refresh_token,
            "expires_in": session_data.expires_in,
        }
    else:
        return {"status": "pending"}

# --- MODIFIED TRANSFER ENDPOINTS ---

def get_tidal_session(token: str) -> tidalapi.Session:
    """Creates a Tidal session using a user's access token."""
    session = tidalapi.Session()
    session.load_oauth_session(session_id=None, token_type="Bearer", access_token=token)
    if not session.check_login():
        raise HTTPException(status_code=401, detail="Invalid or expired Tidal token.")
    return session

@app.post("/api/like/songs")
async def like_songs_on_tidal(request: LikeSongsRequest, authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    # ... The rest of the logic remains the same, using this 'tidal_session' object
    return {"status": "success", "message": "Liking songs complete."}

@app.post("/api/add/albums")
async def add_albums_to_tidal(request: AddAlbumsRequest, authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    # ... The rest of the logic remains the same
    return {"status": "success", "message": "Adding albums complete."}

@app.post("/api/transfer/playlists")
async def transfer_playlists_to_tidal(request: TransferPlaylistRequest, authorization: str = Header(...)):
    token = authorization.split(" ")[1]
    tidal_session = get_tidal_session(token)
    # ... The rest of the logic remains the same
    return {"status": "success", "message": "Playlist transfer complete."}