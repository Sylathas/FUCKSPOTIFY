"use client";

const SERVICES = ["Apple Music", "Tidal", "YouTube Music", "Amazon Music"];

export default function StageService() {
    return (
        <div className="flex flex-col items-center gap-4">
            <h2 className="text-xl font-bold">Destination</h2>
            {SERVICES.map((s) => (
                <button
                    key={s}
                    className="w-full rounded border border-slate-600 px-3 py-2 hover:bg-slate-700"
                >
                    {s}
                </button>
            ))}
        </div>
    );
}