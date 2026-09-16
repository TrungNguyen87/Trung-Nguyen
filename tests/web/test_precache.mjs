import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function findPythonCommandSpec() {
  const candidates = [
    ["python3", ["-c", "print('ok')"], "python3"],
    ["python", ["-c", "print('ok')"], "python"],
    ["py", ["-3", "-c", "print('ok')"], "py -3"],
  ];

  for (const [command, args, spec] of candidates) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (!result.error && result.status === 0) {
      return spec;
    }
  }

  throw new Error("No Python interpreter available for precache tests.");
}

const pythonCommandSpec = findPythonCommandSpec();

function makeFixture(name) {
  const root = mkdtempSync(path.join(tmpdir(), `kmg-${name}-`));
  mkdirSync(path.join(root, "web"), { recursive: true });
  mkdirSync(path.join(root, "tools"), { recursive: true });
  return root;
}

function write(root, relativePath, contents) {
  const fullPath = path.join(root, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function runPrecacheCheck(root, extraEnv = {}) {
  return spawnSync(process.execPath, ["tools/run-check-precache.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      KMG_PRECACHE_ROOT: root,
      KMG_PRECACHE_WEB_ROOT: path.join(root, "web"),
      KMG_PRECACHE_SERVICE_WORKER: path.join(root, "web", "sw.js"),
      KMG_PRECACHE_IGNORE_FILE: path.join(root, "tools", "check_precache.ignore"),
      KMG_PYTHON_COMMANDS: `missingcmd;${pythonCommandSpec}`,
      ...extraEnv,
    },
  });
}

test("precache checker tolerates comments and ignored files", () => {
  const root = makeFixture("precache-ok");
  try {
    write(root, "web/index.html", "<!doctype html>");
    write(root, "web/js/app.js", "console.log('ok');");
    write(root, "web/icons/icon.svg", "<svg />");
    write(root, "web/asset-manifest.json", "{}");
    write(root, "web/uploads/teacher-notes.json", "{}");
    write(
      root,
      "tools/check_precache.ignore",
      "uploads/**\n",
    );
    write(
      root,
      "web/sw.js",
      `const PRECACHE = [
  "./", // keep deep links working offline
  "./index.html",
  "./js/app.js",
  "./icons/icon.svg",
];`,
    );

    const result = runPrecacheCheck(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /PRECACHE is complete/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("precache checker reports both missing and stale entries", () => {
  const root = makeFixture("precache-fail");
  try {
    write(root, "web/index.html", "<!doctype html>");
    write(root, "web/js/app.js", "console.log('ok');");
    write(
      root,
      "web/sw.js",
      `const PRECACHE = [
  "./",
  "./index.html",
  "./ghost.css",
  "./js/missing.js",
];`,
    );

    const result = runPrecacheCheck(root);
    assert.equal(result.status, 1, "expected precache checker to fail");
    assert.match(result.stdout, /Missing from PRECACHE:\n  - \.\/js\/app\.js/);
    assert.match(result.stdout, /Listed in PRECACHE but missing on disk:/);
    assert.match(result.stdout, /  - \.\/ghost\.css/);
    assert.match(result.stdout, /  - \.\/js\/missing\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
