// The only file in the backend that knows Puppeteer exists.
//
// Chromium is launched lazily and reused: a per-call launch costs the user 1-2s
// on every /report, but a permanently resident browser costs ~200MB RSS on a box
// that also runs Postgres. So we keep it warm during a burst of activity and let
// an idle timer reclaim it afterwards.

const puppeteer = require('puppeteer');

const IDLE_MS = Number(process.env.REPORT_BROWSER_IDLE_MS) || 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 20_000;

let browserPromise = null;
let idleTimer = null;

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { closeBrowser().catch(() => {}); }, IDLE_MS);
  // Never hold the process open just to wait out the idle window.
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      // Fall through and relaunch — a failed launch must not poison every
      // subsequent call.
    }
    browserPromise = null;
  }

  browserPromise = puppeteer.launch({
    headless: true,
    // In Docker this points at the Alpine system Chromium; left undefined on a
    // dev machine so Puppeteer resolves the copy it downloaded itself.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // The container's /dev/shm is 64MB, which Chromium will happily exceed.
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--hide-scrollbars',
      '--font-render-hinting=none',
    ],
  }).then((browser) => {
    // A Chromium crash should self-heal on the next render rather than wedging
    // every later /report against a dead handle.
    browser.on('disconnected', () => { browserPromise = null; });
    return browser;
  }).catch((err) => {
    browserPromise = null;
    throw err;
  });

  return browserPromise;
}

// Renders are serialized: one page at a time bounds peak memory instead of
// letting concurrent /report calls OOM the container. Traffic is low enough that
// the added latency is irrelevant.
let queue = Promise.resolve();

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function renderOnce(html, { width, deviceScaleFactor, selector, timeoutMs }) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width, height: 600, deviceScaleFactor });

    // The template is fully self-contained. Aborting every non-data: request is
    // a hard guarantee that a stray external reference can't hang a render for
    // 30s inside a container with no outbound access.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:') || url === 'about:blank') req.continue();
      else req.abort();
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.evaluate(() => document.fonts.ready);

    // Screenshotting the element rather than the viewport means the PNG is
    // exactly as tall as the content, with no manual height arithmetic.
    const element = await page.$(selector);
    if (!element) throw new Error(`Report root "${selector}" not found in rendered HTML`);

    return await element.screenshot({ type: 'png' });
  } finally {
    await page.close().catch(() => {});
    scheduleIdleClose();
  }
}

/**
 * @param {string} html a complete standalone HTML document
 * @returns {Promise<Buffer>} PNG bytes
 */
function renderHtmlToPng(html, opts = {}) {
  const {
    width = 900,
    deviceScaleFactor = 2,
    selector = '#report',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  const run = queue.then(
    () => withTimeout(renderOnce(html, { width, deviceScaleFactor, selector, timeoutMs }), timeoutMs, 'Report render'),
  );

  // Keep the chain alive regardless of this render's outcome.
  queue = run.then(() => {}, () => {});
  return run;
}

async function closeBrowser() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // Already gone.
  }
}

module.exports = { renderHtmlToPng, closeBrowser };
