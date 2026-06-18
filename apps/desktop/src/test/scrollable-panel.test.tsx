import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollablePanel } from "../components/Layout/ScrollablePanel";

describe("ScrollablePanel", () => {
  it("renders children with vertical overflow and flex-shrink fixes", () => {
    const { container } = render(
      <ScrollablePanel data-testid="panel">
        <div>content</div>
      </ScrollablePanel>
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel).toHaveStyle({
      overflowX: "hidden",
      overflowY: "auto",
      minHeight: "0px",
      display: "flex",
    });
  });

  it("supports horizontal direction", () => {
    const { container } = render(
      <ScrollablePanel direction="horizontal">
        <div>content</div>
      </ScrollablePanel>
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel).toHaveStyle({
      overflowX: "auto",
      overflowY: "hidden",
      minWidth: "0px",
    });
  });

  it("supports both directions", () => {
    const { container } = render(
      <ScrollablePanel direction="both">
        <div>content</div>
      </ScrollablePanel>
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel).toHaveStyle({
      overflow: "auto",
    });
  });
});
