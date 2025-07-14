import NextAuth, { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

//--- configuration -----------------------------------------------------------
export const authOptions: NextAuthOptions = {
    providers: [
        SpotifyProvider({
            clientId: process.env.SPOTIFY_CLIENT_ID!,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
            authorization:
                "https://accounts.spotify.com/authorize?scope=" +
                [
                    "user-read-email",
                    "playlist-read-private",
                    "playlist-read-collaborative",
                    "user-library-read",
                    "streaming",
                ].join("%20"), // scopes need URL encoding
        }),
    ],
    secret: process.env.NEXTAUTH_SECRET,
    pages: { signIn: "/login" },

    callbacks: {
        // run only on initial sign‑in
        async jwt({ token, account, user }) {
            if (account && user) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.accessTokenExpires = account.expires_at! * 1000; // ms
                token.username = account.providerAccountId;
            }
            return token; // no manual refresh anymore
        },

        // push the custom fields into the session
        async session({ session, token }) {
            session.user.accessToken = token.accessToken;
            session.user.refreshToken = token.refreshToken;
            session.user.accessTokenExpires = token.accessTokenExpires;
            session.user.username = token.username;
            return session;
        },
    },
};

// For the *app router* we must export GET and POST
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };