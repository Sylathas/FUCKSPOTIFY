import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = "http://localhost:3000/api/callback";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: code!,
    redirect_uri: redirectUri,
    client_id: clientId!,
    client_secret: clientSecret!,
  });

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenData = await tokenRes.json();

  // Here normally you'd save to a cookie/session, for now just return JSON
  return NextResponse.json(tokenData);
}
