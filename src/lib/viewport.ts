// Tracks the part of the screen the on-screen keyboard leaves visible.
//
// Every iOS browser (all WebKit) and Android Chrome shrink only the visual
// viewport when the keyboard opens; the page's layout, and 100dvh, stay the
// same. While the keyboard is up this sets data-keyboard, --visible-height and
// --visible-top on <html>; globals.css then fits the game into the visible
// area with the guess bar just above the keyboard, by cropping the bottom of
// the scope (the empty part below the clues goes first) rather than scaling
// it, so the drawing never jumps.

// The visual viewport is this much shorter than the layout one: a keyboard,
// not a browser bar (iOS 26 can leave ~24px behind after the keyboard closes).
const KEYBOARD_PX = 100;

/** Starts tracking the visual viewport; returns a function that stops. */
export function trackVisibleArea(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  let frame = 0;

  const clear = () => {
    delete root.dataset.keyboard;
    root.style.removeProperty("--visible-height");
    root.style.removeProperty("--visible-top");
  };
  const update = () => {
    // Pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
    const zoomed = Math.abs(vv.scale - 1) > 0.01;
    if (zoomed || window.innerHeight - vv.height < KEYBOARD_PX) return clear();
    root.dataset.keyboard = "";
    root.style.setProperty("--visible-height", `${Math.round(vv.height)}px`);
    root.style.setProperty("--visible-top", `${Math.round(vv.offsetTop)}px`);
  };
  // At most once per frame while the keyboard animates.
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };

  update();
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  return () => {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    cancelAnimationFrame(frame);
    clear();
  };
}
