import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = require(playwrightModule);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, "preview-source.html");
const outputDir = resolve(scriptDir, "previews-v2");

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 3000 },
  deviceScaleFactor: 1,
});

await page.goto(pathToFileURL(sourcePath).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

const shots = page.locator("[data-shot]");
const count = await shots.count();
if (count !== 5) {
  throw new Error(`Expected 5 App Store previews, found ${count}`);
}

for (let index = 0; index < count; index += 1) {
  const shot = shots.nth(index);
  const name = await shot.getAttribute("data-shot");
  if (!name) throw new Error(`Preview ${index + 1} is missing data-shot`);
  await shot.screenshot({
    path: resolve(outputDir, `${name}-1320x2868.png`),
    animations: "disabled",
  });
  console.log(`Rendered ${name}`);
}

await browser.close();
