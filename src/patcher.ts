import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const PATCH_START = '<!-- kolorru-thimmu:start -->';
const PATCH_END   = '<!-- kolorru-thimmu:end -->';

const HTML_CANDIDATES = [
  ['out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'],
  ['out', 'vs', 'workbench', 'workbench.desktop.main.html'],
  ['out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'],
];

export function getHtmlPath(): string {
  for (const parts of HTML_CANDIDATES) {
    const candidate = path.join(vscode.env.appRoot, ...parts);
    if (fs.existsSync(candidate)) { return candidate; }
  }
  return path.join(vscode.env.appRoot, ...HTML_CANDIDATES[0]);
}

// ---------------------------------------------------------------------------
// Keyframe generation
// ---------------------------------------------------------------------------

export interface PatchOptions {
  hueRange:   [number, number];
  saturation: number;
  lightness:  number;
  opacity:    number;
  durationSec: number;
  random:     boolean;
}

function generateKeyframes(opts: PatchOptions): string {
  const { hueRange, saturation: s, lightness: l, opacity: a, random } = opts;
  const [min, max] = hueRange;
  const span  = max > min ? max - min : 360;
  const stops = Math.min(span, 72); // cap at 72 stops — smooth enough

  let frames = '';
  for (let i = 0; i <= stops; i++) {
    const pct = ((i / stops) * 100).toFixed(2);
    const hue = random
      ? (min + Math.random() * span).toFixed(1)       // random: shuffle within range
      : (min + (i / stops) * span).toFixed(1);        // rainbow: linear sweep
    frames += `  ${pct}%{background:hsla(${hue},${s}%,${l}%,${a})}\n`;
  }
  return `@keyframes kolorru{\n${frames}}`;
}

function buildPatch(opts: PatchOptions): string {
  const kf  = generateKeyframes(opts);
  const dur = opts.durationSec.toFixed(1);
  const css = `body::after{content:""!important;position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;pointer-events:none!important;z-index:99999!important;animation:kolorru ${dur}s linear infinite!important;}`;
  return `${PATCH_START}\n<style>\n${kf}\n${css}\n</style>\n${PATCH_END}`;
}

// ---------------------------------------------------------------------------
// Patch / unpatch
// ---------------------------------------------------------------------------

export function isPatched(): boolean {
  try {
    return fs.readFileSync(getHtmlPath(), 'utf8').includes(PATCH_START);
  } catch {
    return false;
  }
}

export function patch(opts: PatchOptions): void {
  const htmlPath = getHtmlPath();
  let html = fs.readFileSync(htmlPath, 'utf8');
  // Always remove old patch first so settings changes take effect
  if (html.includes(PATCH_START)) {
    const start = html.indexOf(PATCH_START);
    const end   = html.indexOf(PATCH_END);
    html = html.slice(0, start) + html.slice(end + PATCH_END.length).replace(/^\n/, '');
  }
  html = html.replace('</html>', `${buildPatch(opts)}\n</html>`);
  fs.writeFileSync(htmlPath, html, 'utf8');
}

export function unpatch(): void {
  const htmlPath = getHtmlPath();
  let html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf(PATCH_START);
  const end   = html.indexOf(PATCH_END);
  if (start === -1) { return; }
  html = html.slice(0, start) + html.slice(end + PATCH_END.length).replace(/^\n/, '');
  fs.writeFileSync(htmlPath, html, 'utf8');
}
