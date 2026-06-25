import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView; the workbench AgentMessageList calls
// it in an effect. Stub it so components that auto-scroll can mount in tests.
Element.prototype.scrollIntoView = () => {};

// jsdom has no real 2D canvas. Return a Proxy that no-ops any drawing method and
// gives sensible values for the few that return things, so canvas components
// (PianoRoll, mixer meters, automation lanes) can mount in tests.
HTMLCanvasElement.prototype.getContext = (() => {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getImageData") return () => ({ data: [] });
        if (prop === "canvas") return undefined;
        // Style/state properties read as empty; everything else is a no-op fn.
        if (
          prop === "fillStyle" ||
          prop === "strokeStyle" ||
          prop === "font" ||
          prop === "lineWidth" ||
          prop === "textBaseline" ||
          prop === "textAlign" ||
          prop === "globalAlpha"
        ) {
          return "";
        }
        return noop;
      },
      set: () => true,
    }
  );
}) as unknown as HTMLCanvasElement["getContext"];
