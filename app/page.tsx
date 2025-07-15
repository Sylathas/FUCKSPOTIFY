import Header from "./components/Header";
import StageLogin from "./stages/StageLogin";
import StageSongs from "./stages/StageSongs.client";
import StageAlbums from "./stages/StageAlbums.client";
import StagePlaylists from "./stages/StagePlaylists.client";
import StageService from "./stages/StageService";
import StageTransfer from "./stages/StageTransfer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSpotifySdk } from "@/lib/getSpotifySdk";

export default async function Home() {
  /* ①  grab session (or null) */
  const session = await getServerSession(authOptions);

  /* ②  fetch library once (if logged in) */
  let tracks: any[] = [];
  let albums: any[] = [];
  let playlists: any[] = [];

  if (session?.user?.accessToken) {
    const sdk = getSpotifySdk({
      accessToken: session.user.accessToken!,
      refreshToken: session.user.refreshToken!,
      expiresAt: session.user.accessTokenExpires!,
    });

    const [t, a, p] = await Promise.all([
      sdk.currentUser.tracks.savedTracks(50, 0),
      sdk.currentUser.albums.savedAlbums(50, 0),
      sdk.currentUser.playlists.playlists(50, 0),
    ]);

    tracks = t.items;
    albums = a.items;
    playlists = p.items;
  }

  /* ③  horizontal strip – six fixed‑width divs */
  return (
    <>
      <Header />

      <section className="flex overflow-x-auto bg-red-600 pb-4">
        <Panel>
          <StageLogin />
        </Panel>

        <Panel>
          <StageSongs tracks={tracks} />
        </Panel>

        <Panel>
          <StageAlbums albums={albums} />
        </Panel>

        <Panel>
          <StagePlaylists playlists={playlists} />
        </Panel>

        <Panel>
          <StageService />
        </Panel>

        <Panel>
          <StageTransfer />
        </Panel>
      </section>
    </>
  );
}

/* helper – each panel gets the same width (change later if needed) */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-[360px] shrink-0 px-3 py-4 lg:min-w-[480px]">
      {children}
    </div>
  );
}