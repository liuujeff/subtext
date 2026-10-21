// Keeps the game inside the part of the screen the player can see while the
// on-screen keyboard is up.
//
// iOS Safari (and Android browsers that ignore interactive-widget) shrink only
// the visual viewport when the keyboard opens. A page sized to 100dvh then
// sits partly under the keyboard, and the browser scrolls it up to reach the
// input: blank page first, then the game jumps. Instead, while the keyboard is
// up this sets --app-height and --app-top on <html> to the visible area, and
// globals.css pins main.game there (position: fixed, so there's nothing to
// scroll). Android Chrome resizes the layout itself (interactiveWidget in
// layout.tsx), so 100dvh already fits there and these stay unset.
//
// Safari only reports the new size once its keyboard animation is under way,
// after it has decided whether to scroll. So when a text field gains focus,
// the game shrinks straight away to the keyboard height seen last time (or a
// guess): the field is then already above the keyboard and Safari has nothing
// to scroll. The real size replaces the guess as soon as it's known.

// The visual viewport is this much shorter than the layout one: a keyboard,
// not just a browser bar.
const KEYBOARD_PX = 100;
// No keyboard seen yet: phone keyboards (with their suggestion bar) take
// about this share of the screen.
const GUESS_SHARE = 0.4;
// Focus without a keyboard (a hardware keyboard, or focus set by script):
// let go of the guess if the viewport hasn't shrunk by then.
const SETTLE_MS = 700;
const STORE_KEY = "subtext-keyboard";

function storedKeyboard(): number {
  try {
    return Number(localStorage.getItem(STORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text"));

/** Starts tracking the visual viewport; returns a function that stops. */
export function fitToVisualViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  let keyboard = storedKeyboard();
  let frame = 0;
  let settle: number | undefined;

  const set = (height: number, top: number) => {
    root.style.setProperty("--app-height", `${Math.round(height)}px`);
    root.style.setProperty("--app-top", `${Math.round(top)}px`);
  };
  const clear = () => {
    root.style.removeProperty("--app-height");
    root.style.removeProperty("--app-top");
  };

  // Returns whether the keyboard is up.
  const measure = (): boolean => {
    // Pinch-zoom also shrinks the visual viewport; leave the layout alone then.
    const zoomed = Math.abs(vv.scale - 1) > 0.01;
    const covered = window.innerHeight - vv.height;
    if (zoomed || covered < KEYBOARD_PX) return false;
    if (covered !== keyboard) {
      keyboard = covered;
      try {
        localStorage.setItem(STORE_KEY, String(Math.round(covered)));
      } catch {}
    }
    // Undo any scroll Safari made toward the field: the game fits as it is.
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    set(vv.height, vv.offsetTop);
    return true;
  };

  const fit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (measure()) {
        window.clearTimeout(settle);
        settle = undefined;
      } else if (settle === undefined) {
        clear(); // no keyboard, and no guess waiting for one
      }
    });
  };

  const onFocus = (e: FocusEvent) => {
    if (!touch || !isTextField(e.target)) return;
    if (window.innerHeight - vv.height >= KEYBOARD_PX) return; // already up
    const guess = keyboard || window.screen.height * GUESS_SHARE;
    set(window.innerHeight - guess, 0);
    window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      settle = undefined;
      fit();
    }, SETTLE_MS);
  };

  measure();
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  window.addEventListener("scroll", fit);
  document.addEventListener("focusin", onFocus);
  return () => {
    vv.removeEventListener("resize", fit);
    vv.removeEventListener("scroll", fit);
    window.removeEventListener("scroll", fit);
    document.removeEventListener("focusin", onFocus);
    cancelAnimationFrame(frame);
    window.clearTimeout(settle);
    clear();
  };
}
