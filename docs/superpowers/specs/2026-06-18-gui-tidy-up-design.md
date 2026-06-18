# GUI Scrollbars & Tidy-Up Design

## Goal
Make every content panel in Beehive Studio IDE scroll correctly when it overflows, and apply a consistent set of small spacing/alignment fixes so the workbench feels finished rather than prototype-y.

## Approach
Introduce a single reusable wrapper component + themed scrollbar CSS, then apply it to all panels that currently clip or overflow.

## Components

### 1. `ScrollablePanel`
- **Location:** `apps/desktop/src/components/Layout/ScrollablePanel.tsx`
- **Props:**
  - `children: ReactNode`
  - `direction?: "vertical" | "horizontal" | "both"` (default `vertical`)
  - `gap?: number` — CSS gap in px for flex column/row layouts
  - `padding?: number` — CSS padding in px
  - `className?: string`
- **Behavior:**
  - Uses `display: flex`
  - Sets `flex-direction` based on `direction`
  - Applies `min-height: 0` and `min-width: 0` so flex children can shrink inside `react-resizable-panels`
  - Applies `overflow` based on direction
  - Adds `className="jb-scrollable"` for themed scrollbars

### 2. Themed Scrollbar CSS
- **Location:** `apps/desktop/src/styles/jetbee-theme.css`
- **Rules:**
  - `scrollbar-width: thin` for Firefox
  - WebKit scrollbar track uses `--jb-scrollbar` (#3D2E22)
  - WebKit scrollbar thumb uses `--jb-scrollbar-hover` (#5A4535) on hover
  - Border-radius to match the 5–6 px radius used elsewhere
  - Only appears when content overflows (`overflow: auto`)

## Panels to Wrap

1. **Left rail** (`ResizableWorkbench` left panel) — wraps `leftRail`
2. **Center canvas** (`ResizableWorkbench` center-top panel) — wraps `center`
3. **Right rail** (`ResizableWorkbench` right panel) — wraps `rightRail`
4. **Bottom rail** (`ResizableWorkbench` bottom panel) — wraps `bottomRail`
5. **Tab content** (`TabbedEditor`) — wraps active tab content
6. **Session View clip grid** (`SessionViewGrid`) — wrap grid in scrollable container, keep "Launch Scene" header fixed above it
7. **Agent Director panel** — wrap main content below header so reasoning + controls scroll together
8. **BuildConsole log area** — wrap log lines so long output is scrollable

## Tidying Fixes

- Add consistent `gap: 6px` / `padding: 8px 12px` to top toolbar button groups
- Ensure tab bar has `flex-shrink: 0` and the tab content gets `min-height: 0`
- Center empty-state text vertically and horizontally in `SessionViewGrid`
- Add `min-height: 0` to all direct flex children of `ResizableWorkbench` panels
- Remove hardcoded inline scrollbar colors where they exist

## Out of Scope

- Changing panel resize behavior of `react-resizable-panels`
- Redesigning visual theme colors
- Adding collapsible panel animations
- Refactoring component state logic

## Success Criteria

- Every panel listed above shows a themed scrollbar when its content exceeds its height
- No panel content is clipped or pushed off-screen
- `pnpm exec tsc --noEmit` and `just test` still pass
- The workbench layout remains usable at 1280×720 and 1920×1080
