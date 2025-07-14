"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function Stage1Login() {
    const { status } = useSession();

    return (
        <div className="flex h-full flex-col items-center justify-center">
            {status === "authenticated" ? (
                <>
                    <p className="mb-4 text-xl">✅ Logged in!</p>
                    <button
                        onClick={() => signOut()}
                        className="rounded bg-slate-800 px-4 py-2 text-white"
                    >
                        SIGNED IN
                    </button>
                </>
            ) : (
                <button
                    onClick={() => signIn("spotify")}
                    className="rounded bg-slate-800 px-6 py-3 text-xl text-white"
                >
                    LOGIN TO SPOTIFY
                </button>
            )}
        </div>
    );
}