"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/game/api-client";
import type { Stats } from "@/lib/game/stats";
import { getSupabaseBrowser, signInWithGoogle, signOut } from "@/lib/supabase/browser";

// Google sign-in is switched off for now (also `enabled = false` for the
// provider in supabase/config.toml). Set to true to bring back the sign-in
// button and the guest merge.
const SIGN_IN_ENABLED = false;

// Which user this tab has already merged guest progress into, so a page load
// doesn't ask again.
const LINKED_KEY = "subtext-linked";

async function linkGuest(userId: string): Promise<boolean> {
  try {
    if (sessionStorage.getItem(LINKED_KEY) === userId) return false;
  } catch {}
  const { merged } = await api.link();
  try {
    sessionStorage.setItem(LINKED_KEY, userId);
  } catch {}
  return merged;
}

type User = { id: string; email: string | null } | null | undefined; // undefined: still checking

/**
 * The drawer's account section: sign in with Google, and the player's streaks
 * and stats (guests get theirs too, tied to the browser). `onMerged` runs when
 * a guest's progress was moved into the account, `onSignedOut` after signing
 * out; both mean today's rounds should be loaded again.
 */
export function Account({
  open,
  onMerged,
  onSignedOut,
}: {
  open: boolean;
  onMerged: () => void;
  onSignedOut: () => void;
}) {
  const [user, setUser] = useState<User>(undefined);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const mergedRef = useRef(onMerged);
  useEffect(() => {
    mergedRef.current = onMerged;
  });

  useEffect(() => {
    if (!SIGN_IN_ENABLED) return;
    const { data } = getSupabaseBrowser().auth.onAuthStateChange((event, session) => {
      const next = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      setUser((prev) => (prev?.id === next?.id ? prev : next));
      // Not inside this callback: the API client asks the auth client for the
      // token, which waits for the callback to return.
      if (next && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        window.setTimeout(() => {
          linkGuest(next.id)
            .then((merged) => merged && mergedRef.current())
            .catch(() => {}); // tried again on the next visit
        }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Fresh numbers each time the drawer opens (and when the account changes).
  const userId = !SIGN_IN_ENABLED ? null : user === undefined ? undefined : (user?.id ?? null);
  useEffect(() => {
    if (!open || userId === undefined) return;
    let active = true;
    api
      .stats()
      .then((s) => {
        if (!active) return;
        setStats(s);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [open, userId]);

  async function signIn() {
    try {
      await signInWithGoogle();
    } catch {
      setFailed(true);
    }
  }

  async function leave() {
    await signOut();
    setUser(null);
    setStats(null);
    onSignedOut();
  }

  return (
    <section className="account" aria-label="Account and stats">
      <h3>Your stats</h3>
      {stats ? (
        <dl className="stats">
          <Stat label="Current streak" value={stats.currentStreak} />
          <Stat label="Best streak" value={stats.bestStreak} />
          <Stat label="Days completed" value={stats.daysCompleted} />
          <Stat label="Average day" value={stats.averageScore} />
          <Stat label="Best day" value={stats.bestScore} />
          <Stat label="Best words found" value={stats.bestWordHits} />
        </dl>
      ) : (
        <p>{failed ? "Couldn’t load your stats." : "Loading…"}</p>
      )}
      {!SIGN_IN_ENABLED ? null : user ? (
        <div className="who">
          <span>Signed in{user.email ? ` as ${user.email}` : ""}</span>
          <button type="button" className="ghost" onClick={() => void leave()}>
            Sign out
          </button>
        </div>
      ) : (
        user === null && (
          <div className="who">
            <span>Sign in to keep your streak and stats on any device.</span>
            <button type="button" onClick={() => void signIn()}>
              Sign in with Google
            </button>
          </div>
        )
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "–"}</dd>
    </div>
  );
}
