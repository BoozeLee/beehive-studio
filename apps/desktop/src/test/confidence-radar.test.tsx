import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceRadar } from "../components/ProposalPanel/ConfidenceRadar";

describe("ConfidenceRadar", () => {
  it("renders an axis label per named dimension (excluding overall)", () => {
    render(
      <ConfidenceRadar
        confidence={{
          overall: 0.8,
          groove: 0.9,
          darkness: 0.6,
          hypnotic: 0.7,
          brief_fidelity: 0.5,
          validity: 0.85,
        }}
      />
    );
    expect(screen.getByTestId("confidence-radar")).toBeInTheDocument();
    expect(screen.getByText("Groove")).toBeInTheDocument();
    expect(screen.getByText("Darkness")).toBeInTheDocument();
    expect(screen.getByText("Brief fit")).toBeInTheDocument();
    expect(screen.getByText("Validity")).toBeInTheDocument();
  });

  it("renders nothing when fewer than 3 dimensions", () => {
    const { container } = render(<ConfidenceRadar confidence={{ overall: 0.8, groove: 0.9 }} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
