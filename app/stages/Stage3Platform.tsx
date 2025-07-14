"use client";

const PLATFORMS = [
    "Apple Music",
    "Tidal",
    "YouTube Music",
    "Amazon Music",
    "SoundCloud",
];

export default function Stage3Platform() {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-xl">Where do you want to transfer?</p>
            <div className="grid grid-cols-2 gap-4">
                {PLATFORMS.map((p) => (
                    <button
                        key={p}
                        className="rounded border border-slate-600 px-4 py-2 hover:bg-slate-700"
                    >
                        {p}
                    </button>
                ))}
            </div>
        </div>
    );
}