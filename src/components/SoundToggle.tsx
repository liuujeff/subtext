"use client";

import { useSyncExternalStore } from "react";

import { isMuted, setMuted, sfx, subscribeMuted } from "@/lib/sound";

/** The speaker button (top right): sound on or off, for this browser. */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);

  function toggle() {
    setMuted(!muted);
    if (muted) sfx.ping(80, 0); // turned on: a ping, so the player hears it worked
  }

  return (
    <button type="button" className="sound-button" aria-label="Sound" aria-pressed={!muted} onClick={toggle}>
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {muted ? (
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        ) : (
          <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
        )}
      </svg>
    </button>
  );
}
