"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Account } from "./Account";
import { ThemePicker } from "./ThemePicker";

const SEEN_KEY = "subtext-seen-how-to-play";

/**
 * The menu button (top left) and the drawer it opens: how to play, play
 * buttons, the player's account and stats, appearance. This is where the
 * archive and account options will go too. "How to play" is a section that
 * opens expanded on a player's first visit (the drawer opens by itself then)
 * and collapsed after that. `onAccountChange` runs when signing in or out
 * changed whose rounds the page should show.
 */
export function Menu({
  onRandom,
  onAccountChange,
  children,
}: {
  onRandom: () => void;
  onAccountChange: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const close = () => dialog.current?.close();
  const show = (expandHow: boolean) => {
    dialog.current?.showModal();
    setOpen(true);
    setHowOpen(expandHow);
  };

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return; // no storage (private mode, previews): don't pop up every visit
    }
    if (!dialog.current?.open) show(true);
  }, []);

  // Marked seen once closed, so a reload before then shows it again.
  const markSeen = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        className="menu-button"
        aria-label="Menu"
        aria-haspopup="dialog"
        onClick={() => show(false)}
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
            <h2 id="menu-title">Menu</h2>
            <button type="button" className="ghost close" aria-label="Close" onClick={close}>
              ×
            </button>
          </div>
          <details className="section" open={howOpen} onToggle={(e) => setHowOpen(e.currentTarget.open)}>
            <summary>How to play</summary>
            <p className="lede">Find one word that sits between two others in meaning.</p>
            {children}
          </details>
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
          <Account open={open} onMerged={onAccountChange} onSignedOut={onAccountChange} />
          <ThemePicker />
        </div>
      </dialog>
    </>
  );
}
