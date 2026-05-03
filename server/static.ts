import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { registerSeoRoutes } from "./seo";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // ── SEO: robots.txt + sitemap.xml + SSR for public marketing routes ──
  // Registered BEFORE express.static so static's default index.html serving
  // for `/` does not bypass the SSR layer.
  const indexPath = path.resolve(distPath, "index.html");
  let cachedTemplate: string | null = null;
  const getTemplate = async () => {
    if (cachedTemplate) return cachedTemplate;
    cachedTemplate = await fs.promises.readFile(indexPath, "utf-8");
    return cachedTemplate;
  };
  registerSeoRoutes(app, getTemplate);

  // index: false so static does not auto-serve index.html for `/`
  // (SEO SSR above already handles `/` and other public routes).
  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(indexPath);
  });
}
