"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { ThemePicker } from "./ThemePicker";

const SEEN_KEY = "subtext-seen-how-to-play";

/**
 * The menu button (top left) and the "How to play" drawer it opens. The
 * drawer opens by itself on a player's first visit.
 */
export function HowToPlay({ onRandom, children }: { onRandom: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return; // no storage (private mode, previews): don't pop up every visit
    }
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  // Marked seen once closed, so a reload before then shows it again.
  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        className="menu-button"
        aria-label="How to play"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="menu"
        aria-labelledby="menu-title"
        onClose={markSeen}
        // A click on the backdrop lands on the dialog itself; the body covers the rest.
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="menu-body">
          <div className="menu-head">
            <h2 id="menu-title">How to play</h2>
            <button type="button" className="ghost close" aria-label="Close" onClick={close}>
              ×
            </button>
          </div>
          <p className="lede">
            Find one word that sits between two others in meaning. Five pairs a day, three guesses each.
          </p>
          {children}
          <div className="row">
            <button type="button" onClick={close}>
              Play today’s pairs
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                close();
                onRandom();
              }}
            >
              Play a random pair
            </button>
          </div>
          <ThemePicker />
        </div>
      </dialog>
    </>
  );
}
