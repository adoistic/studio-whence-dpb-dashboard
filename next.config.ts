import type { NextConfig } from "next";
import path from "node:path";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Static export — Firebase Hosting serves the prerendered files from out/.
  // Auth + route protection run client-side in the browser, so static export
  // is fully compatible (all routes are static; no server runtime needed).
  output: "export",
  images: { unoptimized: true },
  // Pin the workspace root so Next/Turbopack doesn't infer a stray lockfile
  // in a sibling directory (Creative-Studio/package-lock.json).
  turbopack: {
    root: path.resolve(__dirname),
  },
  pageExtensions: ["ts", "tsx", "mdx"],
};

const withMDX = createMDX();

export default withMDX(nextConfig);
