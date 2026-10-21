// Tracks the part of the screen the on-screen keyboard leaves visible.
//
// Every iOS browser (all WebKit) and Android Chrome shrink only the visual
// viewport when the keyboard opens; the page's layout, and 100dvh, stay the
// same. While the keyboard is up this sets data-keyboard, --visible-height and
// --visible-top on <html>; globals.css then fits the game into the visible
// area with the guess bar just above the keyboard, by cropping the bottom of
// the scope (the empty part below the clues goes first) rather than scaling
// it, so the drawing never jumps.
//
// Two iOS habits need heading off:
// - Safari slides the whole page up when a field it's about to cover gains
//   focus (blank space shows below the page), before the viewport reports
//   the keyboard. So when a field the player touched takes focus, the game is
//   fitted to the keyboard height seen last time (or a guess); the field is
//   then already above the keyboard and Safari has nothing to slide. The real
//   size replaces the guess once the keyboard has settled: while it's still
//   sliding up, the area above it is taller than the guess, and following
//   it would push the guess bar down and back up again. Not on the touch
//   itself: moving the field from under the finger before the tap ends sends
//   the tap elsewhere, and the field never gets focus (no keyboard). Not on
//   focus set from code either: that opens no keyboard on iOS.
// - With the keyboard up, iOS lets the page be dragged around. The game fits
//   the visible area and has nothing to scroll, so drags are blocked then.

// The visual viewport is this much shorter than the layout one: a keyboard,
// not a browser bar (iOS 26 can leave ~24px behind after the keyboard closes).
const KEYBOARD_PX = 100;
// No keyboard seen yet: phone keyboards (with their suggestion bar) take
// about this share of the screen.
const GUESS_SHARE = 0.4;
// Focus that brings up no keyboard (a hardware keyboard): let go of the guess
// if the viewport still hasn't shrunk by then.
const NO_KEYBOARD_MS = 800;
// The keyboard has stopped moving once the viewport is this still.
const SETTLE_MS = 150;
// Focus this soon after a touch on the same field came from that touch.
const TOUCH_FOCUS_MS = 1000;
const STORE_KEY = "subtext-keyboard";

function storedKeyboard(): number {
  try {
    return Number(localStorage.getItem(STORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text"));

/** Starts tracking the visual viewport; returns a function that stops. */
export function trackVisibleArea(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  let keyboard = storedKeyboard();
  let frame = 0;
  let still: number | undefined; // the keyboard's height is remembered once it stops
  let waiting: number | undefined; // a guess is up, waiting for the keyboard
  let shown = 0; // the height the game is fitted to
  let touched: { target: EventTarget | null; at: number } = { target: null, at: 0 };

  const set = (height: number, top: number) => {
    shown = height;
    root.dataset.keyboard = "";
    root.style.setProperty("--visible-height", `${Math.round(height)}px`);
    root.style.setProperty("--visible-top", `${Math.round(top)}px`);
  };
  const clear = () => {
    delete root.dataset.keyboard;
    root.style.removeProperty("--visible-height");
    root.style.removeProperty("--visible-top");
  };
  const keyboardUp = () =>
    // Pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
    Math.abs(vv.scale - 1) <= 0.01 && window.innerHeight - vv.height >= KEYBOARD_PX;

  const settle = (ms: number) => {
    window.clearTimeout(waiting);
    waiting = window.setTimeout(() => {
      waiting = undefined;
      update();
    }, ms);
  };
  const update = () => {
    if (!keyboardUp()) {
      if (waiting === undefined) clear();
      return;
    }
    if (waiting !== undefined && vv.height > shown + 1) {
      // Still sliding up past the guess: wait until it stops.
      settle(SETTLE_MS);
      return;
    }
    window.clearTimeout(waiting);
    waiting = undefined;
    set(vv.height, vv.offsetTop);
    // Not mid-slide: a keyboard closing passes through every smaller height.
    window.clearTimeout(still);
    still = window.setTimeout(remember, SETTLE_MS);
  };
  const remember = () => {
    const covered = window.innerHeight - vv.height;
    if (!keyboardUp() || Math.abs(covered - keyboard) < 1) return;
    keyboard = covered;
    try {
      localStorage.setItem(STORE_KEY, String(Math.round(covered)));
    } catch {}
  };
  // At most once per frame while the keyboard animates.
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };

  const onPointerDown = (e: PointerEvent) => {
    touched = { target: e.target, at: Date.now() };
  };
  const onFocusIn = (e: FocusEvent) => {
    const fromTouch = touched.target === e.target && Date.now() - touched.at < TOUCH_FOCUS_MS;
    if (!touch || !fromTouch || !isTextField(e.target) || keyboardUp()) return;
    set(window.innerHeight - (keyboard || window.screen.height * GUESS_SHARE), 0);
    settle(NO_KEYBOARD_MS);
  };

  const onTouchMove = (e: TouchEvent) => {
    // The menu drawer scrolls on its own; nothing else should move.
    if ("keyboard" in root.dataset && !(e.target instanceof Element && e.target.closest("dialog"))) {
      e.preventDefault();
    }
  };

  update();
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  return () => {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("touchmove", onTouchMove);
    cancelAnimationFrame(frame);
    window.clearTimeout(waiting);
    window.clearTimeout(still);
    clear();
  };
}
