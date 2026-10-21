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

// The visual viewport is this much shorter than the layout one: a keyboard,
// not just a browser bar.
const KEYBOARD_PX = 100;

/** Starts tracking the visual viewport; returns a function that stops. */
export function fitToVisualViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;

  const clear = () => {
    root.style.removeProperty("--app-height");
    root.style.removeProperty("--app-top");
  };
  const fit = () => {
    // Pinch-zoom also shrinks the visual viewport; leave the layout alone then.
    const zoomed = Math.abs(vv.scale - 1) > 0.01;
    if (zoomed || window.innerHeight - vv.height < KEYBOARD_PX) return clear();
    root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
    root.style.setProperty("--app-top", `${Math.round(vv.offsetTop)}px`);
  };

  fit();
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  return () => {
    vv.removeEventListener("resize", fit);
    vv.removeEventListener("scroll", fit);
    clear();
  };
}
