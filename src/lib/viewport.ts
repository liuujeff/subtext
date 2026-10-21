// Keeps the game inside the part of the screen the player can see while the
// on-screen keyboard is up.
//
// iOS Safari (every iOS browser: they're all WebKit) and Android browsers that
// ignore interactive-widget shrink only the visual viewport when the keyboard
// opens. A page sized to 100dvh then sits partly under the keyboard, and the
// browser scrolls it up to reach the input. Instead, while a text field has
// focus, this sets --app-height and --app-top on <html> to the visible area;
// globals.css pins main.game there and locks the page, so there's nothing to
// scroll. Android Chrome resizes the layout itself (interactiveWidget in
// layout.tsx), so 100dvh already fits there and these stay unset.
//
// The game is resized at most twice per keyboard, never per animation frame
// (that made the scope jitter):
// - when the player touches a text field, straight away, to the keyboard
//   height seen last time (or a guess), before Safari focuses it and decides
//   whether to scroll toward it (focus set from code doesn't open the iOS
//   keyboard, so it doesn't count);
// - once the visual viewport has stopped changing, to its real size.
// On blur it goes back to full height at once; the keyboard slides away over it.

// The visual viewport is this much shorter than the layout one: a keyboard,
// not a browser bar (iOS 26 can leave ~24px behind after the keyboard closes).
const KEYBOARD_PX = 100;
// No keyboard seen yet: phone keyboards (with their suggestion bar) take
// about this share of the screen.
const GUESS_SHARE = 0.4;
// The viewport counts as settled once it's this long without a change.
const QUIET_MS = 150;
// A touch that brings up no keyboard (a hardware keyboard, a cancelled tap):
// let go of the guess if the viewport still hasn't shrunk by then.
const NO_KEYBOARD_MS = 800;
const STORE_KEY = "subtext-keyboard";

function storedKeyboard(): number {
  try {
    return Number(localStorage.getItem(STORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

const isTextField = (el: Element | EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text"));

/** Starts tracking the visual viewport; returns a function that stops. */
export function fitToVisualViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  let keyboard = storedKeyboard();
  let quiet: number | undefined;
  let noKeyboard: number | undefined;

  const typing = () => touch && isTextField(document.activeElement);
  const covered = () => window.innerHeight - vv.height;
  // Pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
  const keyboardUp = () => Math.abs(vv.scale - 1) <= 0.01 && covered() >= KEYBOARD_PX;

  const set = (height: number, top: number) => {
    root.style.setProperty("--app-height", `${Math.round(height)}px`);
    root.style.setProperty("--app-top", `${Math.round(top)}px`);
  };
  const clear = () => {
    window.clearTimeout(quiet);
    window.clearTimeout(noKeyboard);
    quiet = noKeyboard = undefined;
    root.style.removeProperty("--app-height");
    root.style.removeProperty("--app-top");
  };
  // Undo any scroll Safari made toward the field: the game already fits.
  const unscroll = () => {
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };

  // The viewport has stopped moving: fit the keyboard that's up, or let go.
  const settle = () => {
    quiet = undefined;
    if (!typing()) return clear();
    if (!keyboardUp()) return; // still on the focus-time guess; noKeyboard decides
    window.clearTimeout(noKeyboard);
    noKeyboard = undefined;
    if (Math.abs(covered() - keyboard) >= 1) {
      keyboard = covered();
      try {
        localStorage.setItem(STORE_KEY, String(Math.round(keyboard)));
      } catch {}
    }
    unscroll();
    set(vv.height, vv.offsetTop);
  };

  const onViewport = () => {
    if (!typing()) {
      // A keyboard closing (or a toolbar moving): nothing to fit.
      if (root.style.getPropertyValue("--app-height")) clear();
      return;
    }
    unscroll();
    window.clearTimeout(quiet);
    quiet = window.setTimeout(settle, QUIET_MS);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!touch || !isTextField(e.target) || keyboardUp()) return;
    set(window.innerHeight - (keyboard || window.screen.height * GUESS_SHARE), 0);
    window.clearTimeout(noKeyboard);
    noKeyboard = window.setTimeout(() => {
      noKeyboard = undefined;
      if (!keyboardUp()) clear();
    }, NO_KEYBOARD_MS);
  };

  // Focus left the field (blur, a button, the field removed with the round):
  // back to full height now, unless it went straight to another field.
  const onFocusOut = () => {
    window.setTimeout(() => {
      if (!typing()) clear();
    }, 0);
  };

  vv.addEventListener("resize", onViewport);
  vv.addEventListener("scroll", onViewport);
  window.addEventListener("scroll", onViewport);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusout", onFocusOut);
  return () => {
    vv.removeEventListener("resize", onViewport);
    vv.removeEventListener("scroll", onViewport);
    window.removeEventListener("scroll", onViewport);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("focusout", onFocusOut);
    clear();
  };
}
