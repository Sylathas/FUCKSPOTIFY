"use client";

import type { SavedTrack } from "@spotify/web-api-ts-sdk";

export default function StageSongs({ tracks }: { tracks: SavedTrack[] }) {
    return (
        <div>
            <h2 className="mb-2 text-xl font-bold">Songs</h2>
            <ul className="h-[60vh] overflow-y-auto space-y-1">
                {tracks.length === 0 ? (
                    <p className="text-slate-400">– no data –</p>
                ) : (
                    tracks.map(({ track }) => (
                        <li key={track.id} className="truncate">
                            {track.name} – {track.artists.map((a) => a.name).join(", ")}
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}