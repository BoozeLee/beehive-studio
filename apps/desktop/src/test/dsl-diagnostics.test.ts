import { describe, expect, it } from "vitest";
import { validateJetBeeDsl } from "../lib/dslDiagnostics";

describe("JetBee DSL diagnostics", () => {
  it("accepts valid core fields and ownership directives", () => {
    expect(validateJetBeeDsl("bpm: 142\nstyle: dark ritual\n@owner bass-1 dsl")).toEqual([]);
  });

  it("reports invalid BPM, ownership, and brace errors", () => {
    const diagnostics = validateJetBeeDsl("bpm: 500\n@owner bass-1 maybe\n}");
    expect(diagnostics.map((item) => item.severity)).toEqual(["error", "error", "error"]);
  });
});
