"use client";

import type { SavedAlbum } from "@spotify/web-api-ts-sdk";

export default function StageAlbums({ albums }: { albums: SavedAlbum[] }) {
    return (
        <div>
            <h2 className="mb-2 text-xl font-bold">Albums</h2>
            <ul className="h-[60vh] overflow-y-auto space-y-1">
                {albums.length === 0 ? (
                    <p className="text-slate-400">– no data –</p>
                ) : (
                    albums.map(({ album }) => (
                        <li key={album.id} className="truncate">
                            {album.name} – {album.artists.map((a) => a.name).join(", ")}
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}