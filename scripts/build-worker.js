/**
 * Build Worker for Cloudflare Dashboard deployment
 * Output: dist/worker.js (single file to paste in Dashboard)
 * ใช้ compress-stub แทน Photon (ไม่มี WASM) - รูปจะไม่ถูกบีบอัด
 * สำหรับบีบอัดรูป: ใช้ wrangler deploy แทน (npm run deploy:workers)
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const outDir = path.join(__dirname, "..", "dist");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const workersSrc = path.join(__dirname, "..", "workers", "src");
const stubPath = path.join(workersSrc, "compress-stub.ts");

const noPhotonPlugin = {
  name: "no-photon",
  setup(build) {
    build.onResolve({ filter: /compress-photon$/ }, () => ({
      path: stubPath,
    }));
  },
};

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
    plugins: [noPhotonPlugin],
    banner: {
      js: "/* LineUnifiedInbox Worker - Deploy via Cloudflare Dashboard (no image compression) */",
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
