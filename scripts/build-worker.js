/**
 * Build Worker for Cloudflare Dashboard deployment
 * Output: dist/worker.js (single file to paste in Dashboard)
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const outDir = path.join(__dirname, "..", "dist");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "workers", "src", "index.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    outfile: path.join(outDir, "worker.js"),
    minify: true,
    sourcemap: false,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    banner: {
      js: "/* LineUnifiedInbox Worker - Deploy via Cloudflare Dashboard */",
    },
  })
  .then(() => {
    console.log("✓ Worker built: dist/worker.js");
    console.log("  Copy contents to Cloudflare Dashboard → Workers → Edit code");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
