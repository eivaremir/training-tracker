// Builds the installable-app images in static/ from the app's own SVG marks.
//   node scripts/build-pwa-assets.mjs                 app icons, favicon.ico, badge, shortcuts, iOS launch screens
//   node scripts/build-pwa-assets.mjs --screenshots   also store screenshots of a demo build (overwrites build/)
// Renders with a headless Chromium browser (Chrome, Chromium, Edge or Brave; set CHROME=/path to pick one).
// Also rewrites the apple-touch-startup-image block in src/app.html. Image names are referenced by
// static/manifest.webmanifest and src/service-worker.ts; the script checks the manifest's files exist.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = join(WEB, 'static');
const BG = '#0a0a0a';
const FG = '#fafafa';

// The app icon is the Library "dumbbell" glyph; the favicon keeps its own tighter mark for 16–48px.
const ICONS = readFileSync(join(WEB, 'src/lib/components/Icon.svelte'), 'utf8');
const glyph = (name) => {
  const m = ICONS.match(new RegExp(`^\\s*'?${name}'?: '(.+)',?$`, 'm'));
  if (!m) throw new Error(`Icon "${name}" not found in Icon.svelte`);
  return m[1];
};
const MARK = glyph('dumbbell');

/** A square or rectangular image with `inner` (24×24 icon markup) centered and `box` px wide. */
const svg = ({ width, height = width, box, inner, bg = BG, fg = FG, stroke = 1.8 }) => {
  const k = box / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    (bg ? `<rect width="${width}" height="${height}" fill="${bg}"/>` : '') +
    `<g transform="translate(${(width - box) / 2} ${(height - box) / 2}) scale(${k})" fill="none" stroke="${fg}" ` +
    `stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
};
const page = (body) => `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${body}</body></html>`;

// iOS shows these while an installed app starts; without them the launch screen is white.
// CSS size and pixel ratio of each iPhone/iPad (portrait); a landscape image is made for each too.
const IOS_DEVICES = [
  [440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [414, 896, 3], [375, 812, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [820, 1180, 2], [834, 1112, 2],
  [810, 1080, 2], [744, 1133, 2], [768, 1024, 2]
];

// App icon shortcuts (long-press / right-click on the installed icon). Keep in sync with the manifest.
const SHORTCUTS = { today: 'today', log: 'list', stats: 'history' };

// Store screenshots: path, CSS viewport, pixel ratio, form factor.
const SCREENS = [
  { name: 'home-narrow', path: '/', width: 390, height: 844, scale: 2, mobile: true },
  { name: 'today-narrow', path: '/today', width: 390, height: 844, scale: 2, mobile: true },
  { name: 'stats-narrow', path: '/progress', width: 390, height: 844, scale: 2, mobile: true },
  { name: 'home-wide', path: '/', width: 1440, height: 900, scale: 1, mobile: false }
];

// ---- headless browser over the DevTools pipe (no dependencies) ----------------
function findBrowser() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'
  ];
  const exe = candidates.find((p) => p && existsSync(p));
  if (!exe) throw new Error('No Chromium-based browser found. Set CHROME=/path/to/chrome.');
  return exe;
}

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'tt-pwa-'));
  const proc = spawn(findBrowser(), ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const [, , , toBrowser, fromBrowser] = proc.stdio;
  let seq = 0, buf = Buffer.alloc(0);
  const pending = new Map();
  const waiters = [];
  fromBrowser.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (let i; (i = buf.indexOf(0)) >= 0; buf = buf.subarray(i + 1)) {
      const msg = JSON.parse(buf.subarray(0, i).toString('utf8'));
      if (msg.id) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p?.reject(new Error(`${p.method}: ${msg.error.message}`)) : p?.resolve(msg.result);
      } else {
        for (const w of waiters.filter((w) => w.method === msg.method && w.sessionId === msg.sessionId)) {
          waiters.splice(waiters.indexOf(w), 1); w.resolve(msg.params);
        }
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject, method });
    toBrowser.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (method, params) => send(method, params, sessionId);
  const next = (method) => new Promise((resolve) => waiters.push({ method, sessionId, resolve }));
  await cmd('Page.enable');

  /** Loads `url` (or an HTML string) at the given viewport and returns the screenshot bytes. */
  async function shoot({ url, html, width, height = width, scale = 1, mobile = false, transparent = false, format = 'png', settle = 0 }) {
    await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await cmd('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    const loaded = next('Page.loadEventFired');
    await cmd('Page.navigate', { url: url ?? `data:text/html;base64,${Buffer.from(page(html)).toString('base64')}` });
    await loaded;
    await cmd('Runtime.evaluate', { awaitPromise: true, expression:
      `document.fonts.ready.then(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), ${settle})))` });
    const { data } = await cmd('Page.captureScreenshot', { format, ...(format === 'png' ? {} : { quality: 88 }) });
    return Buffer.from(data, 'base64');
  }
  const close = async () => {
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    await send('Browser.close').catch(() => {});
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    proc.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return { shoot, close };
}

// ---- outputs -------------------------------------------------------------------
/** A .ico holding PNG images (supported by every browser that still asks for /favicon.ico). */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

function write(rel, data) {
  const file = join(STATIC, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`  ${rel.padEnd(40)} ${(data.length / 1024).toFixed(1).padStart(7)} KB`);
}

const splashName = (w, h) => `splash/apple-splash-${w}x${h}.png`;

function splashLinks() {
  const links = IOS_DEVICES.flatMap(([w, h, r]) => ['portrait', 'landscape'].map((o) => {
    const [pw, ph] = o === 'portrait' ? [w * r, h * r] : [h * r, w * r];
    return `  <link rel="apple-touch-startup-image" href="%sveltekit.assets%/${splashName(pw, ph)}" ` +
      `media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${o})" />`;
  }));
  const file = join(WEB, 'src/app.html');
  const html = readFileSync(file, 'utf8');
  const start = '<!-- pwa:splash -->', end = '<!-- /pwa:splash -->';
  if (!html.includes(start) || !html.includes(end)) throw new Error(`src/app.html needs ${start} … ${end} markers`);
  const out = html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${links.join('\n')}\n  ${end}`);
  writeFileSync(file, out);
  console.log(`  src/app.html: ${links.length} launch screen links`);
}

/** Serves build/ like Amplify does: real files, otherwise the SPA shell. */
function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
  const srv = createServer((req, res) => {
    let file = join(dir, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!file.startsWith(dir + sep) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

// ---- main ----------------------------------------------------------------------
const b = await launch();
try {
  console.log('App icons');
  for (const [rel, size, pct] of [['icon-192.png', 192, 0.625], ['icon-512.png', 512, 0.625], ['apple-touch-icon.png', 180, 0.625],
    ['icon-maskable-192.png', 192, 0.5], ['icon-maskable-512.png', 512, 0.5]]) {
    write(rel, await b.shoot({ width: size, html: svg({ width: size, box: size * pct, inner: MARK }) }));
  }

  // favicon-32.png is pixel-tuned by hand (crisper than a render at that size), so it's reused, not redrawn.
  console.log('favicon.ico');
  const favicon = readFileSync(join(STATIC, 'favicon.svg'), 'utf8');
  const fav = (size) => b.shoot({ width: size, transparent: true, html: favicon.replace('<svg ', `<svg width="${size}" height="${size}" `) });
  write('favicon.ico', ico([
    { size: 16, data: await fav(16) },
    { size: 32, data: readFileSync(join(STATIC, 'favicon-32.png')) },
    { size: 48, data: await fav(48) }
  ]));

  // Android draws notification badges from the alpha channel only, so this is a white mark on transparent.
  console.log('Notification badge');
  write('badge-96.png', await b.shoot({ width: 96, transparent: true, html: svg({ width: 96, box: 96, inner: MARK, bg: null, stroke: 2 }) }));

  console.log('Shortcut icons');
  for (const [name, icon] of Object.entries(SHORTCUTS)) {
    write(`shortcuts/${name}-96.png`, await b.shoot({ width: 96, html: svg({ width: 96, box: 48, inner: glyph(icon) }) }));
  }

  console.log('iOS launch screens');
  for (const [w, h, r] of IOS_DEVICES) {
    for (const [pw, ph] of [[w * r, h * r], [h * r, w * r]]) {
      write(splashName(pw, ph), await b.shoot({ width: pw, height: ph, html: svg({ width: pw, height: ph, box: 100 * r, inner: MARK }) }));
    }
  }
  splashLinks();

  if (process.argv.includes('--screenshots')) {
    console.log('Screenshots (demo-mode build)');
    execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: WEB, stdio: 'inherit', env: { ...process.env, VITE_API_URL: '' } });
    const srv = await serve(join(WEB, 'build'));
    try {
      const origin = `http://127.0.0.1:${srv.address().port}`;
      for (const s of SCREENS) {
        write(`screenshots/${s.name}.webp`, await b.shoot({ ...s, url: origin + s.path, format: 'webp', settle: 1500 }));
      }
    } finally { srv.close(); }
    console.log('  build/ now holds the demo build; run `npm run build` before deploying it by hand.');
  }

  const manifest = JSON.parse(readFileSync(join(STATIC, 'manifest.webmanifest'), 'utf8'));
  const refs = [...manifest.icons, ...(manifest.screenshots ?? []), ...(manifest.shortcuts ?? []).flatMap((s) => s.icons ?? [])];
  const missing = refs.map((r) => r.src).filter((src) => !existsSync(join(STATIC, src)));
  if (missing.length) throw new Error(`manifest.webmanifest references missing files: ${missing.join(', ')}`);
} finally {
  await b.close();
}
