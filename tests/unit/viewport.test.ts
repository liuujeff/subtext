import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fitToVisualViewport } from "@/lib/viewport";

// Stand-ins for the browser: the visual viewport, <html>'s inline style,
// focus, touches, storage and a phone screen.
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
    activeElement: null as FakeElement | null,
    documentElement: {
      style: {
        setProperty: (k: string, v: string) => props.set(k, v),
        removeProperty: (k: string) => props.delete(k),
        getPropertyValue: (k: string) => props.get(k) ?? "",
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

  const field = new FakeElement("INPUT", "text");
  const fire = (target: EventTarget, type: string, on: unknown = undefined) => {
    const e = new Event(type);
    if (on) Object.defineProperty(e, "target", { value: on });
    target.dispatchEvent(e);
  };
  /** The keyboard moves to `height` over a few animation steps. */
  const viewport = (height: number, offsetTop = 0) => {
    const from = vv.height;
    for (const t of [0.25, 0.5, 0.75, 1]) {
      Object.assign(vv, { height: Math.round(from + (height - from) * t), offsetTop: offsetTop * t });
      vv.dispatchEvent(new Event("resize"));
    }
  };
  const tap = (el = field) => fire(doc, "pointerdown", el);
  const focus = (el: FakeElement | null = field) => (doc.activeElement = el);
  const blur = () => {
    doc.activeElement = null;
    fire(doc, "focusout");
  };
  return { props, vv, win, storage, field, viewport, tap, focus, blur };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const height = (props: Map<string, string>) => props.get("--app-height") ?? null;

describe("fitToVisualViewport", () => {
  it("shrinks on the tap, then fits the keyboard once, after it settles", () => {
    const { props, viewport, tap, focus } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    const seen: (string | null)[] = [];

    tap();
    seen.push(height(props));
    focus();
    viewport(330, 8);
    seen.push(height(props)); // mid-animation: unchanged
    vi.advanceTimersByTime(200);
    seen.push(height(props));

    expect(seen).toEqual(["360px", "360px", "330px"]);
    expect(props.get("--app-top")).toBe("8px");
    stop();
  });

  it("guesses 40% of the screen the first time and remembers the real keyboard", () => {
    const { props, storage, viewport, tap, focus } = setUp(660);
    const stop = fitToVisualViewport();
    tap();
    expect(height(props)).toBe(`${660 - 700 * 0.4}px`);
    focus();
    viewport(350);
    vi.advanceTimersByTime(200);
    expect(height(props)).toBe("350px");
    expect(storage.get("subtext-keyboard")).toBe("310");
    stop();
  });

  it("goes back to full height as soon as the field loses focus", () => {
    const { props, viewport, tap, focus, blur } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    tap();
    focus();
    viewport(360);
    vi.advanceTimersByTime(200);
    expect(height(props)).toBe("360px");

    blur();
    vi.advanceTimersByTime(0);
    expect(props.size).toBe(0);
    viewport(660); // the keyboard sliding away changes nothing
    vi.advanceTimersByTime(200);
    expect(props.size).toBe(0);
    stop();
  });

  it("lets go when the field disappears with the keyboard up (round over)", () => {
    const { props, viewport, tap, focus } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    tap();
    focus();
    viewport(360);
    vi.advanceTimersByTime(200);
    focus(null); // removed from the page, no focusout
    viewport(660);
    expect(props.size).toBe(0);
    stop();
  });

  it("ignores focus set from code (no keyboard on iOS) and taps on other things", () => {
    const { props, tap, focus } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    focus();
    expect(props.size).toBe(0);
    tap(new FakeElement("BUTTON"));
    expect(props.size).toBe(0);
    stop();
  });

  it("lets go of the guess if no keyboard comes up", () => {
    const { props, tap, focus } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    tap();
    focus();
    expect(height(props)).toBe("360px");
    vi.advanceTimersByTime(1000);
    expect(props.size).toBe(0);
    stop();
  });

  it("undoes a scroll toward the field", () => {
    const { win, viewport, tap, focus } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    tap();
    focus();
    win.scrollY = 120;
    viewport(360);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    stop();
  });

  it("does nothing without a touch screen, for browser bars, or when zoomed", () => {
    const desktop = setUp(660, { touch: false, stored: "300" });
    let stop = fitToVisualViewport();
    desktop.tap();
    desktop.focus();
    desktop.viewport(360);
    vi.advanceTimersByTime(200);
    expect(desktop.props.size).toBe(0);
    stop();

    const phone = setUp(660, { stored: "300" });
    stop = fitToVisualViewport();
    phone.focus();
    phone.viewport(620); // a toolbar, not a keyboard
    vi.advanceTimersByTime(200);
    expect(phone.props.size).toBe(0);
    phone.vv.scale = 2; // zoomed in
    phone.viewport(330);
    vi.advanceTimersByTime(1000);
    expect(phone.props.size).toBe(0);
    stop();
  });

  it("clears its settings when stopped", () => {
    const { props, tap, focus } = setUp(660, { stored: "300" });
    const stop = fitToVisualViewport();
    tap();
    focus();
    expect(props.size).toBe(2);
    stop();
    expect(props.size).toBe(0);
  });
});
