import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = "http://localhost:3000/api/callback";
  const scope = "user-library-read playlist-read-private";
  const state = Math.random().toString(36).substring(2, 15);

  const authorizeUrl =
    `https://accounts.spotify.com/authorize` +
    `?response_type=code` +
    `&client_id=${clientId}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return NextResponse.redirect(authorizeUrl);
}
