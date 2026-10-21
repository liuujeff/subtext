import { afterEach, describe, expect, it, vi } from "vitest";

import { trackVisibleArea } from "@/lib/viewport";

// A stand-in for window.visualViewport and <html>'s inline style.
function setUp(innerHeight: number) {
  const vv = Object.assign(new EventTarget(), { height: innerHeight, offsetTop: 0, scale: 1 });
  const props = new Map<string, string>();
  const style = {
    setProperty: (k: string, v: string) => props.set(k, v),
    removeProperty: (k: string) => props.delete(k),
  };
  vi.stubGlobal("window", { innerHeight, visualViewport: vv });
  vi.stubGlobal("document", { documentElement: { style } });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => (cb(), 1));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const move = (change: Partial<typeof vv>) => {
    Object.assign(vv, change);
    vv.dispatchEvent(new Event("resize"));
  };
  return { props, move };
}

afterEach(() => vi.unstubAllGlobals());

describe("trackVisibleArea", () => {
  it("follows the area above the keyboard and lets go when it closes", () => {
    const { props, move } = setUp(660);
    const stop = trackVisibleArea();
    expect(props.size).toBe(0);

    move({ height: 340, offsetTop: 12 });
    expect(props.get("--visible-height")).toBe("340px");
    expect(props.get("--visible-top")).toBe("12px");

    move({ height: 660, offsetTop: 0 });
    expect(props.size).toBe(0);
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
