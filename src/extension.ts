import * as vscode from 'vscode';
import * as patcher from './patcher';

// ---------------------------------------------------------------------------
// Color utilities (colorCustomizations mode)
// ---------------------------------------------------------------------------

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const ch = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

interface Preset { label: string; description: string; hueRange: [number, number]; }

const PRESETS: Preset[] = [
  { label: 'Full Rainbow',  description: 'Full 360° hue rotation',        hueRange: [0, 360]   },
  { label: 'Ocean',         description: 'Blue → Teal → Cyan',            hueRange: [180, 240] },
  { label: 'Sunset',        description: 'Orange → Red → Pink',           hueRange: [0, 40]    },
  { label: 'Forest',        description: 'Yellow-Green → Green → Teal',   hueRange: [80, 180]  },
  { label: 'Purple Haze',   description: 'Blue → Violet → Purple',        hueRange: [240, 300] },
  { label: 'Fire',          description: 'Yellow → Orange → Red',         hueRange: [0, 60]    },
  { label: 'Rose Gold',     description: 'Pink → Red → Rose',             hueRange: [330, 360] },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | undefined;
let currentHue  = 0;
let currentMode: 'rainbow' | 'random' = 'rainbow';
let statusBarItem: vscode.StatusBarItem;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function cfg() {
  return vscode.workspace.getConfiguration('kolorru');
}

function isOverlay(): boolean {
  return cfg().get<string>('method', 'colorCustomizations') === 'overlay';
}

function buildPatchOptions(random: boolean): patcher.PatchOptions {
  const config     = cfg();
  const hueRange   = config.get<[number, number]>('hueRange', [0, 360]);
  const saturation = config.get<number>('saturation', 75);
  const lightness  = config.get<number>('lightness', 45);
  const opacity    = config.get<number>('overlayOpacity', 0.25);
  const intervalMs = config.get<number>('intervalMs', 80);
  const hueStep    = config.get<number>('hueStep', 1);
  const span       = (hueRange[1] > hueRange[0] ? hueRange[1] - hueRange[0] : 360);
  const durationSec = (span / hueStep) * (intervalMs / 1000);
  return { hueRange, saturation, lightness, opacity, durationSec, random };
}

// ---------------------------------------------------------------------------
// colorCustomizations engine
// ---------------------------------------------------------------------------

function applyHex(h: number, s: number, l: number): void {
  const hex     = hslToHex(h, s, l);
  const targets = cfg().get<string[]>('targets', []);
  const map: Record<string, string> = {};
  for (const key of targets) { map[key] = hex; }
  vscode.workspace.getConfiguration('workbench')
    .update('colorCustomizations', map, vscode.ConfigurationTarget.Global);
}

function clearHex(): void {
  vscode.workspace.getConfiguration('workbench')
    .update('colorCustomizations', {}, vscode.ConfigurationTarget.Global);
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function startTimer(mode: 'rainbow' | 'random'): void {
  const config     = cfg();
  const [min, max] = config.get<[number, number]>('hueRange', [0, 360]);
  const span       = max - min || 360;

  if (currentHue < min || currentHue > max) { currentHue = min; }

  timer = setInterval(() => {
    const c    = cfg();
    const s    = c.get<number>('saturation', 75);
    const l    = c.get<number>('lightness', 45);
    const step = c.get<number>('hueStep', 1);
    const [lo, hi] = c.get<[number, number]>('hueRange', [0, 360]);
    const sp   = hi - lo || 360;

    let h: number;
    if (mode === 'random') {
      h = randomInRange(lo, hi);
      if (c.get<boolean>('randomizeSL', false)) {
        applyHex(h,
          Math.max(0,  Math.min(100, s + randomInRange(-15, 15))),
          Math.max(10, Math.min(90,  l + randomInRange(-15, 15))));
        return;
      }
    } else {
      currentHue = lo + ((currentHue - lo + step) % sp);
      h = currentHue;
    }
    applyHex(h, s, l);
  }, config.get<number>('intervalMs', 80));

  // suppress unused warning — span only used for clamping above
  void span;
}

function stopTimer(): void {
  if (timer) { clearInterval(timer); timer = undefined; }
  clearHex();
}

// ---------------------------------------------------------------------------
// Overlay engine (patch + reload)
// ---------------------------------------------------------------------------

async function applyOverlay(mode: 'rainbow' | 'random'): Promise<void> {
  try {
    patcher.patch(buildPatchOptions(mode === 'random'));
    updateStatusBar(true);
    const action = await vscode.window.showInformationMessage(
      `Kolorru Overlay: CSS animation patched (${mode}). Reload to activate.`,
      'Reload Now'
    );
    if (action) { vscode.commands.executeCommand('workbench.action.reloadWindow'); }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Kolorru Overlay: patch failed — ${msg}. Try running VS Code as administrator.`
    );
  }
}

async function removeOverlay(): Promise<void> {
  try {
    patcher.unpatch();
    updateStatusBar(false);
    const action = await vscode.window.showInformationMessage(
      'Kolorru Overlay: Patch removed. Reload to restore original colors.',
      'Reload Now'
    );
    if (action) { vscode.commands.executeCommand('workbench.action.reloadWindow'); }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Kolorru Overlay: unpatch failed — ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Unified start / stop / toggle
// ---------------------------------------------------------------------------

async function startAnimation(mode: 'rainbow' | 'random'): Promise<void> {
  currentMode = mode;
  if (isOverlay()) {
    await applyOverlay(mode);
  } else {
    if (timer) { stopTimer(); }
    startTimer(mode);
    updateStatusBar(true);
    vscode.window.showInformationMessage(
      `Kolorru: ${mode === 'random' ? 'Random 🎲' : 'Rainbow 🌈'} started`
    );
  }
}

function stopAnimation(): void {
  if (isOverlay()) {
    removeOverlay();
  } else {
    stopTimer();
    updateStatusBar(false);
    vscode.window.showInformationMessage('Kolorru: Stopped. Colors restored.');
  }
}

function toggleAnimation(): void {
  if (isOverlay()) {
    if (patcher.isPatched()) { removeOverlay(); } else { applyOverlay(currentMode); }
  } else {
    if (timer) { stopAnimation(); } else { startAnimation(currentMode); }
  }
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function createStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'kolorru.toggle';
  updateStatusBar(isOverlay() && patcher.isPatched());
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

function updateStatusBar(active: boolean): void {
  const method = isOverlay() ? ' [CSS]' : '';
  const emoji  = currentMode === 'random' ? '🎲' : '🌈';
  if (active) {
    statusBarItem.text    = `$(color-mode) Kolorru ${emoji} ●${method}`;
    statusBarItem.tooltip = `Kolorru: ${currentMode}${method} — click to stop`;
    statusBarItem.color   = new vscode.ThemeColor('statusBar.foreground');
  } else {
    statusBarItem.text    = `$(color-mode) Kolorru${method}`;
    statusBarItem.tooltip = 'Kolorru: Click to start animation';
    statusBarItem.color   = undefined;
  }
}

// ---------------------------------------------------------------------------
// Preset picker
// ---------------------------------------------------------------------------

async function pickPreset(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    PRESETS.map(p => ({ label: p.label, description: p.description, preset: p })),
    { placeHolder: 'Select a color preset', title: 'Kolorru: Color Presets' }
  );
  if (!picked) { return; }
  await cfg().update('hueRange', picked.preset.hueRange, vscode.ConfigurationTarget.Global);
  currentHue = picked.preset.hueRange[0];
  vscode.window.showInformationMessage(
    `Kolorru: "${picked.label}" — ${picked.preset.hueRange[0]}°–${picked.preset.hueRange[1]}°`
  );
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  createStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('kolorru.start',         () => startAnimation('rainbow')),
    vscode.commands.registerCommand('kolorru.startRandom',   () => startAnimation('random')),
    vscode.commands.registerCommand('kolorru.stop',          () => stopAnimation()),
    vscode.commands.registerCommand('kolorru.toggle',        () => toggleAnimation()),
    vscode.commands.registerCommand('kolorru.pickPreset',    () => pickPreset()),
    vscode.commands.registerCommand('kolorru.configure',     () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'kolorru')
    ),
    vscode.commands.registerCommand('kolorru.enableOverlay',  () => applyOverlay(currentMode)),
    vscode.commands.registerCommand('kolorru.disableOverlay', () => removeOverlay()),
  );

  if (cfg().get<boolean>('startOnLaunch', false)) {
    startAnimation('rainbow');
  }
}

export function deactivate(): void {
  stopTimer();
}
