import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSpotifySdk } from "../../lib/getSpotifySdk";
import LibraryPane from "./LibraryPane.client";

export default async function Stage2Library() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.accessToken) {
        return (
            <div className="flex h-full items-center justify-center text-xl">
                ⬅️ Log in first
            </div>
        );
    }

    const sdk = getSpotifySdk({
        accessToken: session.user.accessToken!,
        refreshToken: session.user.refreshToken!,
        expiresAt: session.user.accessTokenExpires!,
    });

    const [tracks, albums, playlists] = await Promise.all([
        sdk.currentUser.tracks.savedTracks(50, 0),
        sdk.currentUser.albums.savedAlbums(50, 0),
        sdk.currentUser.playlists.playlists(50, 0),
    ]);

    return (
        <LibraryPane
            tracks={tracks.items}
            albums={albums.items}
            playlists={playlists.items}
        />
    );
}