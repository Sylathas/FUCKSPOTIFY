import os
import sys
import tidalapi
import yaml
from dotenv import load_dotenv

load_dotenv() # Loads variables from a .env file for local development

def open_tidal_session(config=None) -> tidalapi.Session:
    session = tidalapi.Session(config=config)
    
    token_type = os.getenv("TIDAL_TOKEN_TYPE")
    access_token = os.getenv("TIDAL_ACCESS_TOKEN")
    refresh_token = os.getenv("TIDAL_REFRESH_TOKEN")

    if token_type and access_token:
        try:
            if session.load_oauth_session(token_type, access_token, refresh_token):
                print("Tidal session loaded successfully from environment variables.")
                return session
        except Exception as e:
            print(f"Failed to load session from environment variables: {e}")

    try:
        with open('.session.yml', 'r') as session_file:
            previous_session = yaml.safe_load(session_file)
            if session.load_oauth_session(
                token_type=previous_session['token_type'],
                access_token=previous_session['access_token'],
                refresh_token=previous_session['refresh_token']
            ):
                print("Tidal session loaded successfully from file.")
                return session
    except Exception:
        pass # Ignore errors and proceed to login
    
    print("No valid Tidal session found. Starting new login...")
    login, future = session.login_oauth()
    print('Please open this URL in your browser to log into Tidal: ' + login.verification_uri_complete)
    
    future.result()
    
    # --- FIXED: Define session_data *before* the 'with' block ---
    session_data = {
        'session_id': session.session_id,
        'token_type': session.token_type,
        'access_token': session.access_token,
        'refresh_token': session.refresh_token
    }

    with open('.session.yml', 'w') as f:
        yaml.dump(session_data, f)
    
    print("--- NEW TIDAL SESSION CREATED ---")
    print("COPY THESE VALUES INTO YOUR RENDER ENVIRONMENT VARIABLES:")
    print(session_data)
    
    return session