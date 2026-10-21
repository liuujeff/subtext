import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fitToVisualViewport } from "@/lib/viewport";

// Stand-ins for the browser: the visual viewport, <html>'s inline style, focus
// events, storage and a phone screen.
class FakeElement {
  constructor(
    readonly tagName: string,
    readonly type = "",
  ) {}
}

function setUp(innerHeight: number, { touch = true, stored = "" } = {}) {
  const vv = Object.assign(new EventTarget(), { height: innerHeight, offsetTop: 0, scale: 1 });
  const props = new Map<string, string>();
  const doc = Object.assign(new EventTarget(), {
    documentElement: {
      style: {
        setProperty: (k: string, v: string) => props.set(k, v),
        removeProperty: (k: string) => props.delete(k),
      },
    },
  });
  const storage = new Map<string, string>(stored ? [["subtext-keyboard", stored]] : []);
  const win = Object.assign(new EventTarget(), {
    innerHeight,
    scrollY: 0,
    scrollTo: vi.fn(() => (win.scrollY = 0)),
    visualViewport: vv,
    screen: { height: 700 },
    matchMedia: () => ({ matches: touch }),
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => (cb(), 1));
  vi.stubGlobal("cancelAnimationFrame", () => {});

  const move = (change: Partial<typeof vv>) => {
    Object.assign(vv, change);
    vv.dispatchEvent(new Event("resize"));
  };
  const focus = (el = new FakeElement("INPUT", "text")) => {
    const e = new Event("focusin");
    Object.defineProperty(e, "target", { value: el });
    doc.dispatchEvent(e);
  };
  return { props, move, focus, win, storage };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fitToVisualViewport", () => {
  it("fits the game above the keyboard and lets go when it closes", () => {
    const { props, move } = setUp(660);
    const stop = fitToVisualViewport();
    expect(props.size).toBe(0);

    move({ height: 340, offsetTop: 12 });
    expect(props.get("--app-height")).toBe("340px");
    expect(props.get("--app-top")).toBe("12px");

    move({ height: 660, offsetTop: 0 });
    expect(props.size).toBe(0);
    stop();
  });

  it("undoes a scroll toward the field", () => {
    const { move, win } = setUp(660);
    const stop = fitToVisualViewport();
    win.scrollY = 120;
    move({ height: 340 });
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    stop();
  });

  it("shrinks on focus, before the keyboard reports its size, then uses the real one", () => {
    const { props, move, focus } = setUp(660);
    const stop = fitToVisualViewport();
    focus();
    expect(props.get("--app-height")).toBe(`${660 - 700 * 0.4}px`); // a guess: 40% of the screen
    move({ height: 350 });
    expect(props.get("--app-height")).toBe("350px");
    stop();
  });

  it("remembers the keyboard's height for the next time", () => {
    const { props, move, focus, storage } = setUp(660);
    const stop = fitToVisualViewport();
    move({ height: 360 });
    expect(storage.get("subtext-keyboard")).toBe("300");
    move({ height: 660 });
    focus();
    expect(props.get("--app-height")).toBe("360px");
    stop();
  });

  it("lets go of the guess if no keyboard comes up", () => {
    const { props, focus } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    focus();
    expect(props.get("--app-height")).toBe("360px");
    vi.advanceTimersByTime(1000);
    expect(props.size).toBe(0);
    stop();
  });

  it("doesn't guess for buttons, or without a touch screen", () => {
    const button = setUp(660);
    let stop = fitToVisualViewport();
    button.focus(new FakeElement("BUTTON"));
    expect(button.props.size).toBe(0);
    stop();

    const desktop = setUp(660, { touch: false });
    stop = fitToVisualViewport();
    desktop.focus();
    expect(desktop.props.size).toBe(0);
    stop();
  });

  it("ignores browser bars and pinch-zoom", () => {
    const { props, move } = setUp(660);
    const stop = fitToVisualViewport();
    move({ height: 610 }); // a toolbar, not a keyboard
    expect(props.size).toBe(0);
    move({ height: 330, scale: 2 }); // zoomed in
    expect(props.size).toBe(0);
    stop();
  });

  it("clears its settings when stopped", () => {
    const { props, move } = setUp(660);
    const stop = fitToVisualViewport();
    move({ height: 300 });
    expect(props.size).toBe(2);
    stop();
    expect(props.size).toBe(0);
  });
});
