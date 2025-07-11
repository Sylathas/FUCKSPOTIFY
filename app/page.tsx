"use client";

import { useState } from "react";

export default function Home() {
  const [step, setStep] = useState<"select" | "login" | "choose" | "done">(
    "select"
  );
  const [selectedService, setSelectedService] = useState<string | null>(null);

  return (
    <main style={{ padding: "2rem" }}>
      {step === "select" && (
        <div>
          <h1>Select target streaming service</h1>
          <button
            onClick={() => {
              setSelectedService("apple");
              setStep("login");
            }}
          >
            Apple Music
          </button>
          <button
            onClick={() => {
              setSelectedService("tidal");
              setStep("login");
            }}
          >
            Tidal
          </button>
          <button
            onClick={() => {
              setSelectedService("soundcloud");
              setStep("login");
            }}
          >
            SoundCloud
          </button>
          <button
            onClick={() => {
              setSelectedService("soundcloud");
              setStep("login");
            }}
          >
            Youtube Music
          </button>
          <button
            onClick={() => {
              setSelectedService("soundcloud");
              setStep("login");
            }}
          >
            Amazon Music
          </button>
        </div>
      )}

      {step === "login" && (
        <div>
          <h2>Login to Spotify and {selectedService}</h2>
          <a href="/api/spotify">Connect Spotify</a>
          <br />
          <button onClick={() => setStep("choose")}>
            Simulate Login Complete
          </button>
        </div>
      )}

      {step === "choose" && (
        <div>
          <h2>Choose what to import:</h2>
          <label>
            <input type="checkbox" /> Songs
          </label>
          <br />
          <label>
            <input type="checkbox" /> Albums
          </label>
          <br />
          <label>
            <input type="checkbox" /> Playlists
          </label>
          <br />
          <button onClick={() => setStep("done")}>Transfer now!</button>
        </div>
      )}

      {step === "done" && (
        <div>
          <h2>Done! Your music has been transferred to {selectedService}.</h2>
        </div>
      )}
    </main>
  );
}
