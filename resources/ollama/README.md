# Ollama binaries

This directory holds platform-specific portable Ollama binaries that ship with the installer.

Layout after `postinstall`:

```
resources/ollama/
├── win/   ollama.exe           (Windows)
├── mac/   ollama               (macOS, universal)
└── linux/ ollama               (Linux x86_64)
```

These are downloaded automatically by [`scripts/download-ollama.mjs`](../../scripts/download-ollama.mjs) on `npm install`.

To download manually:

```bash
node scripts/download-ollama.mjs
```

To force re-download:

```bash
node scripts/download-ollama.mjs --force
```

Only the binary matching the host platform is downloaded by default. Use `--all` to fetch every platform (for CI / cross-platform builds).

```bash
node scripts/download-ollama.mjs --all
```

## Source

Binaries come from <https://github.com/ollama/ollama/releases>.

The version is pinned in the script. Bump it when needed.
