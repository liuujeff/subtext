import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackVisibleArea } from "@/lib/viewport";

// Stand-ins for the browser: the visual viewport, <html>, touches, storage
// and a phone screen.
class FakeElement {
  constructor(
    readonly tagName: string,
    readonly type = "",
    readonly inDialog = false,
  ) {}
  closest(selector: string) {
    return selector === "dialog" && this.inDialog ? this : null;
  }
}

function setUp(innerHeight: number, { touch = true, stored = "" } = {}) {
  const vv = Object.assign(new EventTarget(), { height: innerHeight, offsetTop: 0, scale: 1 });
  const props = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const doc = Object.assign(new EventTarget(), {
    documentElement: {
      clientHeight: innerHeight,
      dataset,
      style: {
        setProperty: (k: string, v: string) => props.set(k, v),
        removeProperty: (k: string) => props.delete(k),
      },
    },
  });
  const storage = new Map<string, string>(stored ? [["subtext-keyboard", stored]] : []);
  vi.stubGlobal("window", {
    innerHeight,
    visualViewport: vv,
    screen: { height: 700 },
    matchMedia: () => ({ matches: touch }),
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });

  const move = (change: Partial<typeof vv>) => {
    Object.assign(vv, change);
    vv.dispatchEvent(new Event("resize"));
  };
  const dispatch = (type: string, target: FakeElement) => {
    const e = new Event(type, { cancelable: true });
    Object.defineProperty(e, "target", { value: target });
    doc.dispatchEvent(e);
    return e;
  };
  const field = new FakeElement("INPUT", "text");
  // A finger down on `el`, then (unless the tap went elsewhere) focus on it.
  const tap = (el = field, focuses = true) => {
    dispatch("pointerdown", el);
    const sizeBeforeFocus = props.get("--visible-height") ?? null;
    if (focuses) dispatch("focusin", el);
    return sizeBeforeFocus;
  };
  const focusFromCode = (el = field) => dispatch("focusin", el);
  const drag = (el = new FakeElement("DIV")) => dispatch("touchmove", el);
  const height = () => props.get("--visible-height") ?? null;
  return { props, dataset, storage, move, tap, focusFromCode, drag, height };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("trackVisibleArea", () => {
  it("follows the area above the keyboard and lets go when it closes", () => {
    const { props, dataset, move } = setUp(660);
    const stop = trackVisibleArea();
    expect(props.size).toBe(0);

    move({ height: 340, offsetTop: 12 });
    expect(props.get("--visible-height")).toBe("340px");
    expect(props.get("--visible-top")).toBe("12px");
    expect("keyboard" in dataset).toBe(true);

    move({ height: 660, offsetTop: 0 });
    expect(props.size).toBe(0);
    expect("keyboard" in dataset).toBe(false);
    stop();
  });

  it("fits a touched field once it has focus, before the keyboard reports its size", () => {
    const { move, tap, height, storage } = setUp(660);
    const stop = trackVisibleArea();
    expect(tap()).toBeNull(); // nothing moves under the finger before the tap lands
    expect(height()).toBe(`${660 - 700 * 0.35}px`); // first time: 35% of the screen
    move({ height: 350 });
    expect(height()).toBe("350px");
    vi.advanceTimersByTime(150);
    expect(storage.get("subtext-keyboard")).toBe("310");
    move({ height: 660 });
    tap();
    expect(height()).toBe("350px"); // next time: the keyboard seen before
    stop();
  });

  it("holds the fit while the keyboard is still sliding up, then takes its real size", () => {
    const { move, tap, height } = setUp(660, { stored: "300" });
    const stop = trackVisibleArea();
    tap();
    expect(height()).toBe("360px");
    move({ height: 500 }); // halfway: following it would drop the guess bar
    expect(height()).toBe("360px");
    move({ height: 380 }); // a smaller keyboard than last time, and it stops
    expect(height()).toBe("360px");
    vi.advanceTimersByTime(150);
    expect(height()).toBe("380px");
    move({ height: 300 }); // up and settled: follow it (a taller keyboard)
    expect(height()).toBe("300px");
    stop();
  });

  it("follows Safari's scroll at once, even while holding the size", () => {
    const { props, move, tap, height } = setUp(660, { stored: "300" });
    const stop = trackVisibleArea();
    tap();
    move({ height: 380, offsetTop: 95 }); // iOS 27 centres the field
    expect(height()).toBe("360px");
    expect(props.get("--visible-top")).toBe("95px");
    stop();
  });

  it("measures the keyboard against the page, not innerHeight", () => {
    const { dataset, move } = setUp(714);
    const stop = trackVisibleArea();
    // iOS 27: innerHeight drops by the scroll, leaving 98px "covered".
    Object.assign(window, { innerHeight: 509 });
    move({ height: 411, offsetTop: 205 });
    expect("keyboard" in dataset).toBe(true);
    stop();
  });

  it("remembers the keyboard's height only once it stops moving", () => {
    const { move, storage } = setUp(660);
    const stop = trackVisibleArea();
    move({ height: 350 });
    vi.advanceTimersByTime(150);
    expect(storage.get("subtext-keyboard")).toBe("310");
    move({ height: 450 }); // closing: it passes through smaller heights
    move({ height: 540 });
    move({ height: 660 });
    vi.advanceTimersByTime(150);
    expect(storage.get("subtext-keyboard")).toBe("310");
    stop();
  });

  it("lets go of the guess if no keyboard comes up, and ignores other focus", () => {
    const { props, tap, focusFromCode } = setUp(660, { stored: "300" });
    const stop = trackVisibleArea();
    tap(new FakeElement("BUTTON"));
    expect(props.size).toBe(0);
    focusFromCode(); // no touch: no keyboard on iOS
    expect(props.size).toBe(0);
    tap(undefined, false); // the tap didn't focus the field
    expect(props.size).toBe(0);
    tap();
    expect(props.get("--visible-height")).toBe("360px");
    vi.advanceTimersByTime(1000);
    expect(props.size).toBe(0);
    stop();
  });

  it("doesn't guess without a touch screen", () => {
    const { props, tap } = setUp(660, { touch: false, stored: "300" });
    const stop = trackVisibleArea();
    tap();
    expect(props.size).toBe(0);
    stop();
  });

  it("blocks dragging the page while the keyboard is up, except in the menu", () => {
    const { move, drag } = setUp(660);
    const stop = trackVisibleArea();
    expect(drag().defaultPrevented).toBe(false);
    move({ height: 340 });
    expect(drag().defaultPrevented).toBe(true);
    expect(drag(new FakeElement("P", "", true)).defaultPrevented).toBe(false);
    stop();
  });

  it("ignores browser bars, iOS's leftover gap and pinch-zoom", () => {
    const { props, move } = setUp(660);
    const stop = trackVisibleArea();
    move({ height: 636 }); // ~24px left after the keyboard closes (iOS 26)
    expect(props.size).toBe(0);
    move({ height: 330, scale: 2 }); // zoomed in
    expect(props.size).toBe(0);
    stop();
  });

  it("clears its settings when stopped", () => {
    const { props, move } = setUp(660);
    const stop = trackVisibleArea();
    move({ height: 300 });
    expect(props.size).toBe(2);
    stop();
    expect(props.size).toBe(0);
  });
});
