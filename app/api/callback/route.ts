import { NextRequest } from "next/server";

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

  // Instead of returning JSON, return an HTML page that saves to localStorage
  return new Response(
    `
      <html>
        <body>
          <script>
            localStorage.setItem('spotify_token', '${tokenData.access_token}');
            window.location.href = "/";
          </script>
        </body>
      </html>
    `,
    { headers: { "Content-Type": "text/html" } }
  );
}