"use client";

import Image from "next/image";
import { useState } from "react";

import type {
    SavedTrack,
    SavedAlbum,
    SimplifiedPlaylist,
} from "@spotify/web-api-ts-sdk";

type Props = {
    tracks: SavedTrack[];
    albums: SavedAlbum[];
    playlists: SimplifiedPlaylist[];
};

export default function LibraryPane({ tracks, albums, playlists }: Props) {
    /* simple tab state */
    const [tab, setTab] = useState<"tracks" | "albums" | "playlists">("tracks");

    const TabButton = (t: typeof tab, label: string) => (
        <button
            onClick={() => setTab(t)}
            className={`px-4 py-1 ${tab === t ? "bg-slate-700 text-white" : "bg-slate-500 text-slate-300"
                }`}
        >
            {label}
        </button>
    );

    return (
        <div className="flex h-full flex-col">
            {/* tab bar */}
            <div className="mb-2 flex gap-2">{TabButton("tracks", "All songs")}
                {TabButton("albums", "All albums")}
                {TabButton("playlists", "All playlists")}</div>

            {/* list area */}
            <ul className="flex-1 overflow-y-auto rounded border border-slate-600 p-2">
                {tab === "tracks" &&
                    tracks.map(({ track }) => (
                        <li key={track.id} className="truncate">
                            {track.name} – {track.artists.map((a) => a.name).join(", ")}
                        </li>
                    ))}

                {tab === "albums" &&
                    albums.map(({ album }) => (
                        <li key={album.id} className="truncate">
                            {album.name} – {album.artists.map((a) => a.name).join(", ")}
                        </li>
                    ))}

                {tab === "playlists" &&
                    playlists.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 truncate">
                            <Image
                                src={p.images?.[0]?.url ?? "/placeholder.png"}
                                alt=""
                                width={24}
                                height={24}
                            />
                            {p.name}
                        </li>
                    ))}
            </ul>
        </div>
    );
}