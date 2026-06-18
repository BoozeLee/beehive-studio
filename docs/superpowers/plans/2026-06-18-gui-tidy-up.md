# GUI Scrollbars & Tidy-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent scrollbars to every overflowing panel in Beehive Studio IDE and apply small spacing/alignment tidy-ups so the workbench feels finished.

**Architecture:** Introduce a reusable `ScrollablePanel` wrapper that applies `overflow: auto`, themed scrollbar CSS, and the flex-shrink fixes needed inside `react-resizable-panels`. Apply it to the shared `TabbedEditor` content area and to the specific panels that currently overflow (`SessionViewGrid`, `AgentDirector`, `BuildConsole`). Tidy the top toolbar grouping while we’re touching layout.

**Tech Stack:** React 19, TypeScript, CSS custom properties, `react-resizable-panels`, Vitest.

---

## Task 1: Create the `ScrollablePanel` wrapper component

**Files:**
- Create: `apps/desktop/src/components/Layout/ScrollablePanel.tsx`
- Test: `apps/desktop/src/test/scrollable-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `apps/desktop/src/test/scrollable-panel.test.tsx`:

```tsx
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
      overflow: "auto",
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
});
```

- [ ] **Step 2: Run the failing test**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec vitest run src/test/scrollable-panel.test.tsx
```

Expected: fails because `ScrollablePanel` does not exist.

- [ ] **Step 3: Implement `ScrollablePanel`**

Create `apps/desktop/src/components/Layout/ScrollablePanel.tsx`:

```tsx
import type { ReactNode, CSSProperties } from "react";

interface ScrollablePanelProps {
  children: ReactNode;
  direction?: "vertical" | "horizontal" | "both";
  gap?: number;
  padding?: number;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}

export function ScrollablePanel({
  children,
  direction = "vertical",
  gap,
  padding,
  className = "",
  style,
  "data-testid": testId,
}: ScrollablePanelProps) {
  const overflow: CSSProperties =
    direction === "horizontal"
      ? { overflowX: "auto", overflowY: "hidden" }
      : direction === "both"
      ? { overflow: "auto" }
      : { overflowX: "hidden", overflowY: "auto" };

  return (
    <div
      data-testid={testId}
      className={`jb-scrollable ${className}`.trim()}
      style={{
        display: "flex",
        flexDirection: direction === "horizontal" ? "row" : "column",
        minHeight: 0,
        minWidth: 0,
        gap: gap !== undefined ? `${gap}px` : undefined,
        padding: padding !== undefined ? `${padding}px` : undefined,
        ...overflow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the test again**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec vitest run src/test/scrollable-panel.test.tsx
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/Layout/ScrollablePanel.tsx apps/desktop/src/test/scrollable-panel.test.tsx
git commit -m "feat(layout): add ScrollablePanel wrapper component"
```

---

## Task 2: Make rail containers in `ResizableWorkbench` flex correctly

**Files:**
- Modify: `apps/desktop/src/components/Layout/ResizableWorkbench.tsx`

- [ ] **Step 1: Update left/right/bottom rail inner containers**

Replace the left rail wrapper:

```tsx
<div className="jetbee-rail" data-jetbee-pane="explorer" tabIndex={-1} style={{ width: "100%" }}>
```

with:

```tsx
<div className="jetbee-rail" data-jetbee-pane="explorer" tabIndex={-1} style={{ width: "100%", height: "100%", display: "flex", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
```

Replace the right rail wrapper:

```tsx
<div className="jetbee-rail jetbee-rail-right" data-jetbee-pane="inspector" tabIndex={-1} style={{ width: "100%" }}>
```

with:

```tsx
<div className="jetbee-rail jetbee-rail-right" data-jetbee-pane="inspector" tabIndex={-1} style={{ width: "100%", height: "100%", display: "flex", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
```

Replace the bottom rail wrapper:

```tsx
<div className="jetbee-rail jetbee-rail-bottom" data-jetbee-pane="console" tabIndex={-1} style={{ height: "100%" }}>
```

with:

```tsx
<div className="jetbee-rail jetbee-rail-bottom" data-jetbee-pane="console" tabIndex={-1} style={{ height: "100%", width: "100%", display: "flex", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/Layout/ResizableWorkbench.tsx
git commit -m "fix(layout): let rail containers shrink inside resizable panels"
```

---

## Task 3: Wrap `TabbedEditor` content in `ScrollablePanel`

**Files:**
- Modify: `apps/desktop/src/components/Layout/TabbedEditor.tsx`

- [ ] **Step 1: Import `ScrollablePanel`**

Add at the top of `apps/desktop/src/components/Layout/TabbedEditor.tsx`:

```tsx
import { ScrollablePanel } from "./ScrollablePanel";
```

- [ ] **Step 2: Wrap active content**

Replace:

```tsx
      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {activeContent}
      </div>
```

with:

```tsx
      {/* Tab content */}
      <ScrollablePanel style={{ flex: 1, position: "relative" }}>
        {activeContent}
      </ScrollablePanel>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/Layout/TabbedEditor.tsx
git commit -m "feat(layout): make TabbedEditor content scrollable"
```

---

## Task 4: Make `SessionViewGrid` clip grid scrollable with a fixed header

**Files:**
- Modify: `apps/desktop/src/components/SessionView/SessionViewGrid.tsx`

- [ ] **Step 1: Import `ScrollablePanel`**

Add at the top of `apps/desktop/src/components/SessionView/SessionViewGrid.tsx`:

```tsx
import { ScrollablePanel } from "../Layout/ScrollablePanel";
```

- [ ] **Step 2: Restructure the grid area**

Replace:

```tsx
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 4px 8px" }}>
        <ActionBtn onClick={onLaunchScene} accent={BEEHIVE.comb}>
          Launch Scene
        </ActionBtn>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
        padding: 4,
      }}>
      {clips.map((clip) => {
```

with:

```tsx
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 4px 8px", flexShrink: 0 }}>
        <ActionBtn onClick={onLaunchScene} accent={BEEHIVE.comb}>
          Launch Scene
        </ActionBtn>
      </div>
      <ScrollablePanel padding={4}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}>
        {clips.map((clip) => {
```

- [ ] **Step 3: Close the new wrapper at the end of the component**

Replace the final `</>` fragment close:

```tsx
      </div>
    </>
  );
```

with:

```tsx
        </div>
      </ScrollablePanel>
    </div>
  );
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/SessionView/SessionViewGrid.tsx
git commit -m "feat(session-view): scrollable clip grid with fixed header"
```

---

## Task 5: Make `AgentDirector` scroll as a unit

**Files:**
- Modify: `apps/desktop/src/components/AgentDirector/AgentDirector.tsx`

- [ ] **Step 1: Import `ScrollablePanel`**

Add at the top of `apps/desktop/src/components/AgentDirector/AgentDirector.tsx`:

```tsx
import { ScrollablePanel } from "../Layout/ScrollablePanel";
```

- [ ] **Step 2: Wrap the agent panel body**

The component currently returns a root `<div>` with `panelStyle()` that contains the header, agent selector, brief input, action buttons, context, status, reasoning stream, and history. Wrap everything except the header title block in a `ScrollablePanel` so the whole control area scrolls together.

Replace the opening of the returned JSX:

```tsx
  return (
    <div style={{ ...panelStyle(), display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
```

with:

```tsx
  return (
    <div style={{ ...panelStyle(), display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
```

Then find the end of the header block (after the subtitle paragraph) and insert `<ScrollablePanel gap={8}>`:

```tsx
          </div>
        </div>
      </div>

      <ScrollablePanel gap={8}>
```

Close the `ScrollablePanel` just before the final `</div>` of the root return. Add `paddingRight: 4` to the `ScrollablePanel` so the scrollbar does not sit on top of content:

```tsx
      </ScrollablePanel>
    </div>
  );
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/AgentDirector/AgentDirector.tsx
git commit -m "feat(agent-director): scroll the agent control panel as a unit"
```

---

## Task 6: Theme the `BuildConsole` log area

**Files:**
- Modify: `apps/desktop/src/components/BuildConsole/BuildConsole.tsx`

- [ ] **Step 1: Add the scrollable class to the log output**

Replace:

```tsx
      <div
        ref={scrollRef}
        className="jetbee-console"
        style={{ flex: 1, overflow: "auto" }}
```

with:

```tsx
      <div
        ref={scrollRef}
        className="jetbee-console jb-scrollable"
        style={{ flex: 1, overflow: "auto" }}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/BuildConsole/BuildConsole.tsx
git commit -m "style(console): apply themed scrollbar to build console"
```

---

## Task 7: Tidy the top toolbar grouping

**Files:**
- Modify: `apps/desktop/src/JetBeeApp.tsx`

- [ ] **Step 1: Group related top-bar controls**

In the `topBar` definition (around line 1240), wrap the transport/project controls and the action buttons in visual groups with consistent gaps.

Replace:

```tsx
  const topBar = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 12px", background: "var(--jb-toolbar-bg)", borderBottom: "1px solid var(--jb-border)", flexShrink: 0 }}>
      <TransportControls
        isPlaying={transport.isPlaying}
        bpm={transport.bpm}
        currentBeat={transport.currentBeat}
        onPlay={handleTransportPlay}
        onPause={transport.pause}
        onStop={transport.stop}
        onBpmChange={transport.setBpm}
      />
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        placeholder="Project name"
        style={{ padding: "4px 8px", fontSize: 13, background: "var(--jb-bg)", color: "var(--jb-text)", border: "1px solid var(--jb-border)", borderRadius: 4, minWidth: 120 }}
      />
      <BranchSelector projectName={projectName} onBranchChange={handleBranchSwitch} />
      <button className="jetbee-toolbtn" onClick={() => sendBrief()} disabled={isLoading || !brief.trim()}>
        {isLoading ? "Generating..." : "Generate"}
      </button>
```

with:

```tsx
  const topBar = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 12px", background: "var(--jb-toolbar-bg)", borderBottom: "1px solid var(--jb-border)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TransportControls
          isPlaying={transport.isPlaying}
          bpm={transport.bpm}
          currentBeat={transport.currentBeat}
          onPlay={handleTransportPlay}
          onPause={transport.pause}
          onStop={transport.stop}
          onBpmChange={transport.setBpm}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name"
          style={{ padding: "4px 8px", fontSize: 13, background: "var(--jb-bg)", color: "var(--jb-text)", border: "1px solid var(--jb-border)", borderRadius: 4, minWidth: 120 }}
        />
        <BranchSelector projectName={projectName} onBranchChange={handleBranchSwitch} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="jetbee-toolbtn" onClick={() => sendBrief()} disabled={isLoading || !brief.trim()}>
          {isLoading ? "Generating..." : "Generate"}
          </button>
```

- [ ] **Step 2: Close the action group and keep backend health on the right**

Find the line just before `<div style={{ marginLeft: "auto", ... }}>` and insert a closing `</div>` for the action group. The final structure should be:

```tsx
        <button className="jetbee-toolbtn" onClick={() => setShowTimeline(!showTimeline)}>
          {showTimeline ? "Grid" : "Timeline"}
        </button>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <BackendHealth />
      </div>
    </div>
  );
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/JetBeeApp.tsx
git commit -m "style(jetbee): group and space top toolbar controls"
```

---

## Task 8: Verification

- [ ] **Step 1: Run frontend tests**

```bash
cd /home/kilisan/beehive-studio
bash scripts/test-frontend.sh
```

Expected: all tests pass.

- [ ] **Step 2: Run desktop-check**

```bash
cd /home/kilisan/beehive-studio
just desktop-check
```

Expected: passes.

- [ ] **Step 3: Manual visual smoke test**

Launch the app on a display:

```bash
just backend
# separate terminal
GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 just desktop-dev
```

Confirm:
- The Agents panel scrolls when reasoning output is long.
- The Session View clip grid scrolls when many clips exist.
- The left/right/bottom rails scroll when their tab content overflows.
- The top toolbar has visual groups instead of one long row.

- [ ] **Step 4: Update `JUNIE_PROGRESS.md`**

Append:

```markdown
## 2026-06-18 — GUI Scrollbars & Tidy-Up

### Completed
- Added reusable `ScrollablePanel` component with themed scrollbars.
- Wrapped `TabbedEditor` content, `SessionViewGrid`, `AgentDirector`, and `BuildConsole`.
- Fixed rail containers in `ResizableWorkbench` so they shrink correctly inside resizable panels.
- Grouped top toolbar controls for better spacing.

### Verification
- `pnpm exec tsc --noEmit` clean.
- `just desktop-check` passes.
- Frontend tests pass.
- Manual visual smoke test confirms scrollbars in panels.
```

- [ ] **Step 5: Final commit**

```bash
cd /home/kilisan/beehive-studio
git add JUNIE_PROGRESS.md
git commit -m "docs: log GUI scrollbar and tidy-up milestone"
```

---

## Self-Review

- **Spec coverage:** Every panel listed in the design (left rail, center, right rail, bottom rail, tab content, Session View, Agent Director, Build Console, top toolbar) has a corresponding task.
- **Placeholder scan:** No TBDs or vague instructions. Each step has exact file paths and code.
- **Type consistency:** `ScrollablePanel` props (`direction`, `gap`, `padding`) are used consistently across tasks.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-gui-tidy-up.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
