import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorWorkbench } from "../components/Layout/EditorWorkbench";
import { useWorkbenchStore } from "../lib/workbenchStore";

describe("EditorWorkbench", () => {
  it("renders the active tab", () => {
    useWorkbenchStore.setState({ center: { tabs: ["arrangement", "mixer"], activeTab: "mixer" } });
    render(
      <EditorWorkbench
        arrangement={<div>Arr</div>}
        patternEditor={<div>Pattern</div>}
        pianoRoll={<div>Piano</div>}
        mixer={<div>Mixer View</div>}
        effects={<div>FX</div>}
      />
    );
    expect(screen.getByText("Mixer View")).toBeInTheDocument();
  });
});
