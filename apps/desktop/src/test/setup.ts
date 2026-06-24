import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView; the workbench AgentMessageList calls
// it in an effect. Stub it so components that auto-scroll can mount in tests.
Element.prototype.scrollIntoView = () => {};

HTMLCanvasElement.prototype.getContext = (() => ({
  clearRect: () => {},
  createLinearGradient: () => ({
    addColorStop: () => {},
  }),
  fillRect: () => {},
  fillStyle: "",
})) as unknown as HTMLCanvasElement["getContext"];
