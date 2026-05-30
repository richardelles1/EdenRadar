import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = "file:///" + path.join(__dirname, "mockup-research.html").replace(/\\/g, "/");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(file, { waitUntil: "load" });
// Force all scroll-reveal elements visible + trigger bar animations
await page.evaluate(() => {
  window.__forceVisible = true;
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  document.querySelectorAll('.score-bar, .progress-bar').forEach(el => el.classList.add('animated'));
});
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(__dirname, "mockup-research-full.png"), fullPage: true });
await page.screenshot({ path: path.join(__dirname, "mockup-research-hero.png") });
await page.evaluate(() => document.querySelector(".pathway").scrollIntoView());
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(__dirname, "mockup-research-pathway.png") });
console.log("done");
await browser.close();
