// Tracks the part of the screen the on-screen keyboard leaves visible.
//
// Every iOS browser (all WebKit) and Android Chrome shrink only the visual
// viewport when the keyboard opens; the page's layout, and 100dvh, stay the
// same. The game keeps that full-height layout, so nothing in it resizes.
// While the keyboard is up this sets --visible-height and --visible-top on
// <html> to the visible area; globals.css makes main.game a scrolling window
// of that size over the unchanged layout, with the guess bar stuck to its
// bottom edge, just above the keyboard. Only the window changes size, so the
// scope stays put and the player scrolls to see the rest of it.

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
    root.style.removeProperty("--visible-height");
    root.style.removeProperty("--visible-top");
  };
  const update = () => {
    // Pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
    const zoomed = Math.abs(vv.scale - 1) > 0.01;
    if (zoomed || window.innerHeight - vv.height < KEYBOARD_PX) return clear();
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
