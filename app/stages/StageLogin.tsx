"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function StageLogin() {
    const { status } = useSession();

    return (
        <div className="flex flex-col items-center gap-4">
            {status === "authenticated" ? (
                <>
                    <p className="text-lg text-green-300">✅ Logged in</p>
                    <button
                        onClick={() => signOut()}
                        className="rounded bg-slate-800 px-4 py-2 text-white"
                    >
                        Sign out
                    </button>
                </>
            ) : (
                <button
                    onClick={() => signIn("spotify")}
                    className="rounded bg-slate-800 px-6 py-3 text-white"
                >
                    Login to Spotify
                </button>
            )}
        </div>
    );
}