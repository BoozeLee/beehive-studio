import "@testing-library/jest-dom";

HTMLCanvasElement.prototype.getContext = (() => ({
  clearRect: () => {},
  createLinearGradient: () => ({
    addColorStop: () => {},
  }),
  fillRect: () => {},
  fillStyle: "",
})) as unknown as HTMLCanvasElement["getContext"];
