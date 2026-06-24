import { describe, it, expect } from "vitest";
import { BEEHIVE, buttonStyle, panelStyle, commonStyles, hexRow } from "../lib/theme";

describe("BEEHIVE theme", () => {
  it("has all required colors", () => {
    expect(BEEHIVE.bg).toBe("#1e1d1d");
    expect(BEEHIVE.comb).toBe("#f3b217");
    expect(BEEHIVE.text).toBe("#e0e0e0");
    expect(BEEHIVE.success).toBe("#4ADE80");
    expect(BEEHIVE.error).toBe("#EF4444");
    expect(BEEHIVE.warning).toBe("#FBBF24");
  });

  it("buttonStyle returns correct style", () => {
    const style = buttonStyle(BEEHIVE.comb, false);
    expect(style.background).toBe(BEEHIVE.comb);
    expect(style.color).toBe("#000");
    expect(style.border).toBe("none");
  });

  it("buttonStyle handles disabled state", () => {
    const style = buttonStyle(BEEHIVE.comb, true);
    expect(style.background).toBe(BEEHIVE.smoke);
    expect(style.color).toBe(BEEHIVE.textMuted);
  });

  it("panelStyle returns correct shape", () => {
    const style = panelStyle();
    expect(style.background).toBe(BEEHIVE.panel);
    expect(style.border).toBe(`1px solid ${BEEHIVE.border}`);
  });

  it("commonStyles has input style", () => {
    expect(commonStyles.input.background).toBe(BEEHIVE.bg);
    expect(commonStyles.input.color).toBe(BEEHIVE.text);
  });
});

describe("BEEHIVE hexRow", () => {
  it("generates correct number of hexagons", () => {
    const result = hexRow(2, 3, 20);
    const count = (result.match(/<polygon/g) || []).length;
    expect(count).toBe(6);
  });
});
