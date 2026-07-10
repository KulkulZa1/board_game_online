# Board Game Online Design System

## 1. Atmosphere & Identity

The platform should feel like a compact arcade shelf: immediate, legible, and
playful without looking like a marketing page. Each game may own a distinct
world palette, while navigation, status hierarchy, touch targets, and feedback
remain familiar. The signature is a dark play surface with bright state colors
that always communicate an action, resource, warning, or reward.

## 2. Color

### Palette

| Role | Token | Default | Factory | Civilization | Usage |
|---|---|---|---|---|---|
| Surface/primary | `--bg` | `#0c1018` | `#0c1018` | `#0b0f0c` | Page background |
| Surface/secondary | `--panel` | `#141b26` | `#141b26` | transparent | Shell surfaces |
| Surface/elevated | `--panel2` | `#1c2738` | `#1c2738` | `#18241d` | Controls and rows |
| Surface/game panel | `--panelbg` | `#121a15` | `#141b26` | `#121a15` | Dashboard panels |
| Text/primary | `--text` | `#e6edf3` | `#e6edf3` | `#e6efe8` | Main text |
| Text/secondary | `--muted` | `#8595ad` | `#8595ad` | `#8aa394` | Hints and metadata |
| Border/default | `--border` | `#2a3850` | `#2a3850` | `#25382c` | Boundaries and focus |
| Accent/primary | `--accent` | `#f5a623` | phase color | `#6fcf97` | Primary action/current state |
| Accent/secondary | `--accent2` | `#4aa3ff` | `#4aa3ff` | `#ffd166` | Progress and reward |
| Status/success | `--ok` | `#2ecc71` | `#2ecc71` | `#2ecc71` | Healthy state |
| Status/warning | `--warn` | `#f1c40f` | phase warning | `#f1c40f` | Recoverable risk |
| Status/error | `--bad` | `#e74c3c` | `#e74c3c` | `#e74c3c` | Failure and destructive action |

Game-specific phase accents are data, not general UI colors. New interface
elements must use the tokens above instead of adding decorative colors.

## 3. Typography

### Scale

| Level | Size | Weight | Line height | Usage |
|---|---:|---:|---:|---|
| Display | `1.6rem` | 800 | 1.2 | Reward and transition callouts |
| H1 | `1.3rem` | 800 | 1.3 | Overlay title |
| H2 | `1rem` | 800 | 1.35 | Game title and phase |
| H3 | `0.9rem` | 700 | 1.4 | Panel title |
| Body | `0.82rem` | 400 | 1.55 | Main game copy |
| Body/sm | `0.74rem` | 400 | 1.45 | Rows and explanations |
| Caption | `0.68rem` | 600 | 1.35 | Metrics and labels |

- Primary: `'Segoe UI', system-ui, sans-serif`.
- Numeric data uses tabular figures where values update in place.
- Korean phrases should wrap by meaning; compact labels stay on one line only
  when their container has a stable width.

## 4. Spacing & Layout

The base spacing unit is 4px. Existing game shells use 4, 8, 12, 16, 24, and
32px intervals. The maximum gameplay width is 1100-1180px. Factory uses a
full-height canvas shell; dashboard games use a two-column desktop grid that
becomes one scrolling column at 760px. Touch targets are at least 42px on
mobile, and fixed HUD elements must leave the primary play controls uncovered.

## 5. Components

### Game Header
- **Structure:** back link, game identity, primary live metrics.
- **States:** metrics update without moving the header.
- **Accessibility:** links and icon buttons retain text alternatives or titles.

### Progress Module
- **Structure:** label/value row, stable track, fill, optional condition list.
- **Variants:** resource, era stability, breakthrough, boost.
- **States:** waiting, progressing, complete, warning.
- **Motion:** fills animate in 200-300ms; reduced-motion users receive immediate updates.

### Game Action
- **Structure:** icon, command label, gain or cost detail.
- **States:** default, hover, active, focus-visible, disabled, boosted.
- **Accessibility:** native button, keyboard activation, 42px minimum mobile height.

### Overlay
- **Structure:** identity, concise goal, current-state summary, explicit action.
- **States:** new run, continue, victory, failure, transition.
- **Motion:** opacity only; content remains scrollable on short screens.

### Status Row
- **Structure:** name, current value, optional progress or explanation.
- **States:** muted, active, complete, blocked.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | 100-150ms | ease-out | Button press and focus |
| Standard | 200-300ms | ease-in-out | Progress and panel state |
| Emphasis | 400-600ms | cubic-bezier(0.16, 1, 0.3, 1) | Era and reward feedback |

Animation uses transform and opacity for moving elements. Continuous gameplay
animation stops or simplifies under `prefers-reduced-motion`. Every mouse
command must have an equivalent touch path; core clicker actions also have a
keyboard path.

## 7. Depth & Surface

The strategy is mixed but restrained: borders separate dense operational
surfaces, tonal shifts establish hierarchy, and shadows are reserved for
temporary overlays or reward callouts. Cards are at most 8px radius unless an
existing game shell uses a documented 10-12px panel radius. Nested decorative
cards are avoided; repeated rows may use a subtle elevated surface inside one
functional panel.
