// Light / dark theme. With no saved choice the CSS follows the device
// (prefers-color-scheme); a saved "light" or "dark" sets data-theme on <html>.
// Plain module so the root layout (a server component) can use it too.

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "subtext-theme";

/** Runs in <head> before first paint, so a saved choice never flashes the other theme. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
