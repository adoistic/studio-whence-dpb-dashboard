#!/usr/bin/env node
// CI guard: the public dashboard repo must stay a data-less skeleton.
//
// FAILS (exit 1) if:
//   - public/data/images/ exists (as a directory, even if empty), OR
//   - public/data/content.json exists AND parses to JSON carrying any real
//     data: a non-empty lines[].comics, a non-empty lines[].figures, or a
//     non-empty top-level images[] array. Malformed JSON also fails (safer).
//
// PASSES (exit 0) otherwise. A missing content.json is fine (skeleton).
//
// All data is served gated at runtime via the Cloudflare R2 + Firebase
// channel; nothing data-bearing may be committed to this public repo.
// Mirrors the content-repo guard tools/check_public_repo_clean.py.

import { existsSync, statSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const dataDir = join(repoRoot, "public", "data");
const imagesDir = join(dataDir, "images");
const contentPath = join(dataDir, "content.json");

function fail(message) {
  console.error(`CHECK FAILED: ${message}`);
  process.exit(1);
}

// Rule 1: public/data/images/ must not exist.
if (existsSync(imagesDir) && statSync(imagesDir).isDirectory()) {
  fail(
    `public/data/images/ exists. Image assets must never be committed to this ` +
      `public repo — serve them gated at runtime via the R2 + Worker channel. ` +
      `Remove the directory.`
  );
}

// Rule 2: if content.json exists, it must be a data-less skeleton.
if (existsSync(contentPath)) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(contentPath, "utf8"));
  } catch (err) {
    fail(`public/data/content.json is not valid JSON: ${err.message}`);
  }

  const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];
  for (const line of lines) {
    const slug = line?.slug ?? "(unknown)";
    if (Array.isArray(line?.comics) && line.comics.length > 0) {
      fail(
        `public/data/content.json line "${slug}" has ${line.comics.length} ` +
          `comic(s). Comic data must not be bundled in the public repo — ` +
          `serve it gated at runtime.`
      );
    }
    if (Array.isArray(line?.figures) && line.figures.length > 0) {
      fail(
        `public/data/content.json line "${slug}" has ${line.figures.length} ` +
          `figure(s). Figure data must not be bundled in the public repo — ` +
          `serve it gated at runtime.`
      );
    }
  }

  if (Array.isArray(parsed?.images) && parsed.images.length > 0) {
    fail(
      `public/data/content.json has a non-empty images[] (${parsed.images.length} ` +
        `entries). Image data must not be bundled in the public repo — ` +
        `serve it gated at runtime.`
    );
  }
}

console.log("OK: public/data is a clean skeleton");
process.exit(0);
