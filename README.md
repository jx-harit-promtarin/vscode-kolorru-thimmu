# Kolorru Thimmu 🌈

> **Dynamic Rainbow Color Theme for VS Code**  
> Animate your editor's UI colors in real time — smooth hue cycling, fully configurable speed, range, and target elements.

---

## Features

- **Auto-cycling rainbow** — hue rotates 0°→360° continuously, producing violet → blue → green → yellow → orange → red → loop
- **Custom hue range** — restrict animation to any color slice (e.g., blue→purple only)
- **7 built-in presets** — Full Rainbow, Ocean, Sunset, Forest, Purple Haze, Fire, Rose Gold
- **Status bar toggle** — one click to start/stop
- **All settings live** — change speed or saturation while animation is running

---

## Quick Start

1. Install the extension
2. Open Command Palette (`Ctrl+Shift+P`)
3. Run **`Kolorru: Start Rainbow`**
4. Click the status bar item `$(color-mode) Kolorru` to toggle on/off

---

## Commands

| Command | Description |
|---|---|
| `Kolorru: Start Rainbow` | Start the animation |
| `Kolorru: Stop Rainbow` | Stop and restore original colors |
| `Kolorru: Pick Color Preset` | Choose a preset hue range from a list |
| `Kolorru: Open Settings` | Jump to extension settings |

The **status bar item** (bottom-right) acts as a toggle — click it to start or stop.

---

## Configuration

Open Settings (`Ctrl+,`) and search for `kolorru`, or run **`Kolorru: Open Settings`**.

| Setting | Type | Default | Description |
|---|---|---|---|
| `kolorru.intervalMs` | number | `80` | Milliseconds between each step. Lower = faster. Min 16ms. |
| `kolorru.hueStep` | number | `1` | Degrees the hue advances per step. `1` = smooth, `10` = jumpy. |
| `kolorru.saturation` | number | `75` | Color saturation 0–100%. Lower = more grey. |
| `kolorru.lightness` | number | `45` | Color lightness 0–100%. ~45 works best against dark themes. |
| `kolorru.hueRange` | [min, max] | `[0, 360]` | Hue range to cycle through. Both in degrees 0–360. |
| `kolorru.targets` | string[] | see below | `workbench.colorCustomizations` keys to animate. |
| `kolorru.startOnLaunch` | boolean | `false` | Auto-start when VS Code opens. |

### Default targets

```json
"kolorru.targets": [
  "activityBar.background",
  "statusBar.background",
  "titleBar.activeBackground"
]
```

You can add any key from the [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color), for example:

```json
"kolorru.targets": [
  "activityBar.background",
  "statusBar.background",
  "titleBar.activeBackground",
  "sideBar.background",
  "tab.activeBackground",
  "editorGroupHeader.tabsBackground"
]
```

### Speed examples

| Feel | intervalMs | hueStep |
|---|---|---|
| Very slow drift | 200 | 0.5 |
| Smooth (default) | 80 | 1 |
| Energetic | 50 | 2 |
| Disco | 30 | 5 |

---

## Color Presets

| Preset | Hue Range | Colors |
|---|---|---|
| Full Rainbow | 0°–360° | All colors |
| Ocean | 180°–240° | Blue → Teal → Cyan |
| Sunset | 0°–40° | Orange → Red → Pink |
| Forest | 80°–180° | Yellow-Green → Green → Teal |
| Purple Haze | 240°–300° | Blue → Violet → Purple |
| Fire | 0°–60° | Yellow → Orange → Red |
| Rose Gold | 330°–360° | Pink → Red → Rose |

---

## How It Works

### Concept

VS Code exposes a `workbench.colorCustomizations` user setting that overrides any theme's colors at runtime. This extension updates that setting programmatically on a timer — producing a live animation without needing to bundle or switch themes.

### Color model — HSL rotation

Colors are represented in **HSL (Hue, Saturation, Lightness)**:

- **Hue** (0°–360°) maps directly to the color wheel: 0°=red, 120°=green, 240°=blue, 360°=red again
- **Saturation** controls how vivid the color is
- **Lightness** controls brightness

By incrementing only the **hue** on each timer tick, we get a smooth, perceptually uniform color cycle — no complex color interpolation needed.

```
hue = (hue + hueStep) % 360   →   convert to hex   →   write to workbench.colorCustomizations
```

### Architecture

```
activate()
  └─ createStatusBar()           — status bar toggle item
  └─ registerCommand(start)  ──► startRainbow()
  └─ registerCommand(stop)   ──► stopRainbow()
  └─ registerCommand(toggle) ──► toggleRainbow()
  └─ registerCommand(preset) ──► pickPreset()  (QuickPick UI)

startRainbow()
  └─ setInterval(intervalMs)
       └─ advance hue by hueStep within hueRange
       └─ hslToHex(h, s, l)
       └─ workspace.getConfiguration('workbench').update('colorCustomizations', ...)

stopRainbow()
  └─ clearInterval()
  └─ update('colorCustomizations', {})   — restores original theme colors
```

### Key API used

| VS Code API | Purpose |
|---|---|
| `workspace.getConfiguration('workbench').update(...)` | Write color overrides at runtime |
| `workspace.getConfiguration('kolorru')` | Read extension settings |
| `window.createStatusBarItem()` | Status bar toggle button |
| `window.showQuickPick()` | Preset picker UI |
| `ConfigurationTarget.Global` | Write to user settings (not workspace) |

---

## Implementation Plan

The extension was built in the following steps:

### Step 1 — Project scaffold
- Create `package.json` with:
  - Extension metadata (`name`, `displayName`, `engines.vscode`)
  - `contributes.commands` — register all commands VS Code will show in Command Palette
  - `contributes.configuration` — declare all settings with types, defaults, and descriptions
  - `scripts.compile` pointing to `tsc`
- Create `tsconfig.json` targeting CommonJS output into `out/`
- Create `.vscodeignore` (exclude `src/`, `node_modules/` from published package)
- Create `.gitignore`

### Step 2 — Color engine (`src/extension.ts`)
1. **`hslToHex(h, s, l)`** — pure function, converts HSL to `#rrggbb`. Uses the standard formula: compute `a = s * min(l, 1-l)`, then evaluate each RGB channel via the HSL piecewise function.
2. **`startRainbow()`** — reads config, starts `setInterval`, increments `currentHue` each tick, calls `applyColor(hex)`.
3. **`applyColor(hex)`** — reads `kolorru.targets`, builds a `Record<string, string>`, calls `workbench.colorCustomizations.update(...)`.
4. **`stopRainbow()`** — clears the interval, resets `colorCustomizations` to `{}` so the original theme is restored.
5. **`toggleRainbow()`** — checks if timer is running, calls start or stop accordingly.

### Step 3 — Status bar
- `createStatusBar()` creates a right-aligned item with `command: 'kolorru.toggle'`.
- `updateStatusBar(running)` switches text/tooltip/color to reflect current state.

### Step 4 — Preset picker
- `pickPreset()` shows `window.showQuickPick()` with all `PRESETS`.
- On selection, writes `kolorru.hueRange` to Global config and resets `currentHue` to the range start.

### Step 5 — Activate / Deactivate
- `activate()` wires all commands and creates the status bar item.
- Reads `kolorru.startOnLaunch` and calls `startRainbow()` automatically if true.
- `deactivate()` calls `stopRainbow()` to clean up settings when VS Code closes the extension.

### Step 6 — Build & Test
```powershell
npm install
npm run compile          # outputs to out/extension.js
# Press F5 in VS Code to open Extension Development Host
# Run "Kolorru: Start Rainbow" from Command Palette
```

### Step 7 — Package (optional, for distribution)
```powershell
npm install -g @vscode/vsce
vsce package             # produces kolorru-thimmu-0.1.0.vsix
# Install manually: Extensions panel → "..." → Install from VSIX
```

---

## Development

```powershell
# Install dependencies
npm install

# Compile once
npm run compile

# Watch mode (recompiles on save)
npm run watch

# Debug: press F5 in VS Code to open Extension Development Host
```

### Adding a new target color key

Add any key from [code.visualstudio.com/api/references/theme-color](https://code.visualstudio.com/api/references/theme-color) to `kolorru.targets` in your settings. No code change needed.

### Adding a new preset

In [src/extension.ts](src/extension.ts), add an entry to the `PRESETS` array:

```typescript
{ label: 'Arctic', description: 'Cyan → Light Blue', hueRange: [170, 210] },
```

---

## License

MIT
