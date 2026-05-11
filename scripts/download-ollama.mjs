#!/usr/bin/env node
/**
 * Downloads portable Ollama binaries into resources/ollama/<platform>/ollama[.exe].
 *
 * Sources: https://github.com/ollama/ollama/releases
 *
 * Usage:
 *   node scripts/download-ollama.mjs          # current platform only
 *   node scripts/download-ollama.mjs --all    # all 3 platforms (win/mac/linux)
 *   node scripts/download-ollama.mjs --force  # redownload even if present
 */

import { createWriteStream, existsSync, mkdirSync, statSync, chmodSync, renameSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// Pin the Ollama version. Bump as needed.
const OLLAMA_VERSION = 'v0.4.0';
const BASE = `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}`;

const PLATFORMS = {
  win: {
    label: 'Windows x64',
    // ollama-windows-amd64.zip ships a single ollama.exe at the root
    url: `${BASE}/ollama-windows-amd64.zip`,
    archive: 'zip',
    out: 'ollama.exe',
    pickFromArchive: (entries) => entries.find((e) => /ollama\.exe$/i.test(e)),
  },
  mac: {
    label: 'macOS (universal, Darwin)',
    // The macOS release is the .app bundle inside a zip — we want the inner binary.
    // For embedding we use the smaller "Ollama-darwin.zip" → Ollama.app/Contents/MacOS/ollama
    url: `${BASE}/Ollama-darwin.zip`,
    archive: 'zip',
    out: 'ollama',
    pickFromArchive: (entries) =>
      entries.find((e) => /Contents\/MacOS\/ollama$/.test(e)) ??
      entries.find((e) => /\/ollama$/.test(e) && !e.endsWith('.dylib')),
  },
  linux: {
    label: 'Linux x86_64',
    // ollama-linux-amd64.tgz contains bin/ollama and lib/ollama
    url: `${BASE}/ollama-linux-amd64.tgz`,
    archive: 'tar.gz',
    out: 'ollama',
    pickFromArchive: (entries) => entries.find((e) => /bin\/ollama$/.test(e)),
  },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const all = args.includes('--all');

function currentPlatformKey() {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

async function download(url, dest) {
  process.stdout.write(`  Fetching ${url}\n`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const total = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  let lastReport = 0;

  const reader = res.body.getReader();
  const stream = new Readable({
    async read() {
      const { value, done } = await reader.read();
      if (done) {
        this.push(null);
        return;
      }
      received += value.byteLength;
      if (total && Date.now() - lastReport > 1000) {
        const pct = ((received / total) * 100).toFixed(0);
        process.stdout.write(`\r  ${pct}% (${(received / 1e6).toFixed(1)}MB / ${(total / 1e6).toFixed(1)}MB)`);
        lastReport = Date.now();
      }
      this.push(Buffer.from(value));
    },
  });

  await pipeline(stream, createWriteStream(dest));
  process.stdout.write('\n');
}

async function extractZip(archivePath, targetDir, pickFn) {
  const { default: AdmZip } = await tryImport('adm-zip');
  if (AdmZip) {
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries().map((e) => e.entryName);
    const pick = pickFn(entries);
    if (!pick) throw new Error('No matching binary in zip. Entries: ' + entries.slice(0, 5).join(', '));
    const entry = zip.getEntry(pick);
    if (!entry) throw new Error(`Entry not found: ${pick}`);
    return entry.getData();
  }

  // Fallback: use system unzip / tar (PowerShell on Windows)
  const tmp = path.join(targetDir, '__extract__');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force -Path "${archivePath}" -DestinationPath "${tmp}"`,
    ], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', archivePath, '-d', tmp], { stdio: 'inherit' });
  }

  const entries = walkFiles(tmp);
  const pick = pickFn(entries.map((p) => path.relative(tmp, p).split(path.sep).join('/')));
  if (!pick) throw new Error('No matching binary in extracted archive');
  const absolute = path.join(tmp, pick);
  const buf = readFileSync(absolute);
  rmSync(tmp, { recursive: true, force: true });
  return buf;
}

async function extractTarGz(archivePath, targetDir, pickFn) {
  const tmp = path.join(targetDir, '__extract__');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', tmp], { stdio: 'inherit' });

  const entries = walkFiles(tmp);
  const pick = pickFn(entries.map((p) => path.relative(tmp, p).split(path.sep).join('/')));
  if (!pick) throw new Error('No matching binary in tarball');
  const absolute = path.join(tmp, pick);
  const buf = readFileSync(absolute);
  rmSync(tmp, { recursive: true, force: true });
  return buf;
}

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

async function tryImport(name) {
  try {
    return await import(name);
  } catch {
    return { default: null };
  }
}

async function processPlatform(key) {
  const cfg = PLATFORMS[key];
  const platformDir = path.join(ROOT, 'resources', 'ollama', key);
  mkdirSync(platformDir, { recursive: true });

  const targetBinary = path.join(platformDir, cfg.out);
  if (existsSync(targetBinary) && !force) {
    const size = statSync(targetBinary).size;
    if (size > 1_000_000) {
      console.log(`[${cfg.label}] already present (${(size / 1e6).toFixed(1)}MB) — skipping`);
      return;
    }
  }

  console.log(`[${cfg.label}] downloading from ${cfg.url}`);
  const archive = path.join(platformDir, '__archive__');

  try {
    await download(cfg.url, archive);

    const buf =
      cfg.archive === 'zip'
        ? await extractZip(archive, platformDir, cfg.pickFromArchive)
        : await extractTarGz(archive, platformDir, cfg.pickFromArchive);

    writeFileSync(targetBinary, buf);
    if (key !== 'win') chmodSync(targetBinary, 0o755);
    console.log(`[${cfg.label}] saved to ${path.relative(ROOT, targetBinary)}`);
  } catch (e) {
    console.error(`[${cfg.label}] FAILED: ${e.message}`);
    console.error(`  You can download manually from: ${cfg.url}`);
    console.error(`  And place the binary at: ${targetBinary}`);
    // Don't crash install — Ollama can also be detected from system install
  } finally {
    rmSync(archive, { force: true });
  }
}

async function main() {
  console.log(`Ollama binary downloader — version ${OLLAMA_VERSION}`);

  // Skip in CI unless explicitly asked
  if (process.env.SKIP_OLLAMA_DOWNLOAD === '1') {
    console.log('SKIP_OLLAMA_DOWNLOAD=1 set, skipping');
    return;
  }

  const keys = all ? Object.keys(PLATFORMS) : [currentPlatformKey()];
  for (const k of keys) {
    try {
      await processPlatform(k);
    } catch (e) {
      console.error(`Failed to process ${k}:`, e.message);
    }
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(0); // exit 0 so npm install doesn't fail; app can still run with system Ollama
});
