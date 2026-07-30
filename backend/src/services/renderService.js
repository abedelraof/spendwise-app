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

// Loads the HTML into a fresh page (viewport, offline guard, fonts) and hands it
// to `capture`, which decides whether to screenshot or print. Every output
// format shares this so the browser lifecycle lives in exactly one place.
async function withPage(html, { width, deviceScaleFactor, timeoutMs }, capture) {
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

    return await capture(page);
  } finally {
    await page.close().catch(() => {});
    scheduleIdleClose();
  }
}

// Serializes work onto the single-page queue and bounds it with the timeout.
function enqueue(task, timeoutMs, label) {
  const run = queue.then(() => withTimeout(task(), timeoutMs, label));
  // Keep the chain alive regardless of this task's outcome.
  queue = run.then(() => {}, () => {});
  return run;
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

  return enqueue(() => withPage(html, { width, deviceScaleFactor, timeoutMs }, async (page) => {
    // Screenshotting the element rather than the viewport means the PNG is
    // exactly as tall as the content, with no manual height arithmetic.
    const element = await page.$(selector);
    if (!element) throw new Error(`Report root "${selector}" not found in rendered HTML`);
    return element.screenshot({ type: 'png' });
  }), timeoutMs, 'Report render');
}

/**
 * A single-page PDF sized to exactly fit the report card, so it looks identical
 * to the PNG but with crisp, selectable vector text.
 * @param {string} html a complete standalone HTML document
 * @returns {Promise<Buffer>} PDF bytes
 */
function renderHtmlToPdf(html, opts = {}) {
  const {
    width = 900,
    deviceScaleFactor = 2,
    selector = '#report',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  return enqueue(() => withPage(html, { width, deviceScaleFactor, timeoutMs }, async (page) => {
    // Size the "paper" to the card's own box so the whole report is one page
    // rather than A4-paginated with margins. The element is at the origin
    // because the CSS reset zeroes the body margin.
    const height = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return Math.ceil(el ? el.getBoundingClientRect().height : document.body.scrollHeight);
    }, selector);

    const pdf = await page.pdf({
      width: `${width}px`,
      // A few extra px absorbs sub-pixel rounding that would otherwise spill
      // into a blank second page; pageRanges is the hard backstop.
      height: `${height + 4}px`,
      printBackground: true,   // without this the dark theme prints white
      pageRanges: '1',
    });

    // page.pdf() returns a Uint8Array (unlike screenshot's Buffer); Express and
    // Telegraf only accept a Buffer/stream, so normalise the contract here.
    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  }), timeoutMs, 'Report PDF render');
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

module.exports = { renderHtmlToPng, renderHtmlToPdf, closeBrowser };
