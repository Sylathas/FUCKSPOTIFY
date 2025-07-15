"use client";

import Image from "next/image";
import type { SimplifiedPlaylist } from "@spotify/web-api-ts-sdk";

export default function StagePlaylists({
    playlists,
}: {
    playlists: SimplifiedPlaylist[];
}) {
    return (
        <div>
            <h2 className="mb-2 text-xl font-bold">Playlists</h2>
            <ul className="h-[60vh] overflow-y-auto space-y-1">
                {playlists.length === 0 ? (
                    <p className="text-slate-400">– no data –</p>
                ) : (
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
                    ))
                )}
            </ul>
        </div>
    );
}