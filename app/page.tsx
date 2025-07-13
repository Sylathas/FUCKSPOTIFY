"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

type Playlist = { id: string, name: string };
type Album = { id: string, name: string, artist: string };
type Song = { id: string, name: string, artist: string };

export default function Home() {
  const [step, setStep] = useState<"select" | "login" | "choose" | "done">("select");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);

  // for spotify data
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);

  // read from localStorage
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // on first load, see if there's an access token
  useEffect(() => {
    const token = localStorage.getItem("spotify_token");
    if (token) {
      setAccessToken(token);
    }
  }, []);

  // when we reach choose step, load real spotify data
  useEffect(() => {
    if (step === "choose" && accessToken) {
      fetch(`/api/spotify/me?token=${accessToken}`)
        .then(res => res.json())
        .then(data => {
          // console.log(data)
          setPlaylists(
            data.playlists.map((p: any) => ({ id: p.id, name: p.name }))
          );
          setAlbums(
            data.albums.map((a: any) => ({
              id: a.album.id,
              name: a.album.name,
              artist: a.album.artists.map((ar: any) => ar.name).join(", ")
            }))
          );
          setSongs(
            data.songs.map((s: any) => ({
              id: s.track.id,
              name: s.track.name,
              artist: s.track.artists.map((ar: any) => ar.name).join(", ")
            }))
          );
        });
    }
  }, [step, accessToken]);

  return (
    <main className="bg-white min-h-screen flex flex-col items-center">
      {/* HEADER IMAGE */}
      <div className="w-full md:w-auto md:h-screen">
        <Image
          src="/Cover.jpg"
          alt="Header"
          width={214}
          height={268}
          className="w-full h-auto md:h-screen md:w-auto object-contain"
        />
      </div>

      {/* UI */}
      <div className="bg-green-900 text-green-200 border-4 border-green-400 rounded-md p-6 mt-4 max-w-lg w-full shadow-lg">
        {step === "select" && (
          <div>
            <h1 className="font-mono text-xl mb-4">🎵 Select Streaming Service</h1>
            <div className="space-y-2">
              {["apple", "tidal", "soundcloud", "youtube", "amazon"].map(service => (
                <button
                  key={service}
                  className="block w-full bg-green-700 border border-green-300 p-2"
                  onClick={() => {
                    setSelectedService(service);
                    setStep("login");
                  }}
                >
                  {service.charAt(0).toUpperCase() + service.slice(1)} Music
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "login" && (
          <div>
            <h2 className="font-mono text-lg mb-2">
              Login to Spotify and {selectedService}
            </h2>
            <button
              className="block w-full bg-green-700 border border-green-300 p-2 mb-2"
              onClick={() => {
                // redirect to /api/spotify
                window.location.href = "/api/spotify";
              }}
            >
              Connect Spotify
            </button>
            <button
              className="block w-full bg-green-700 border border-green-300 p-2"
              onClick={() => setStep("choose")}
              disabled={!accessToken}
            >
              Continue to select music
            </button>
          </div>
        )}

        {step === "choose" && (
          <div>
            <h2>Choose what to import</h2>
            <label>
              <input
                type="checkbox"
                checked={selectAll}
                onChange={(e) => setSelectAll(e.target.checked)}
              /> Select All
            </label>

            <div className="max-h-80 overflow-y-scroll bg-green-900 text-green-100 p-4 border border-green-400 mt-4">
              <h3>Playlists</h3>
              {playlists.map(pl => (
                <label key={pl.id} className="block py-1">
                  <input type="checkbox" className="mr-2" checked={selectAll} />
                  {pl.name}
                </label>
              ))}
              <h3>Albums</h3>
              {albums.map(al => (
                <label key={al.id} className="block py-1">
                  <input type="checkbox" className="mr-2" checked={selectAll} />
                  {al.name} by {al.artist}
                </label>
              ))}
              <h3>Songs</h3>
              {songs.map(song => (
                <label key={song.id} className="block py-1">
                  <input type="checkbox" className="mr-2" checked={selectAll} />
                  {song.name} by {song.artist}
                </label>
              ))}
            </div>

            <button
              className="mt-4 bg-green-700 border border-green-400 p-2"
              onClick={() => setStep("done")}
            >
              Transfer now!
            </button>
          </div>
        )}

        {step === "done" && (
          <div>
            <h2 className="font-mono text-lg">✅ Done! Transferred to {selectedService}.</h2>
          </div>
        )}
      </div>
    </main>
  );
}