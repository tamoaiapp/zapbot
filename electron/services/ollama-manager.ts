import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { logger } from '../logger';
import { paths } from '../paths';
import type { OllamaModelInfo, OllamaPullProgress } from '../../shared/types';

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const OLLAMA_URL = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

type SpawnState = 'idle' | 'starting' | 'ready' | 'external' | 'error';

class OllamaManager {
  private child: ChildProcess | null = null;
  private state: SpawnState = 'idle';
  private lastError: string | null = null;

  getState() {
    return { state: this.state, error: this.lastError };
  }

  /**
   * Locate the bundled ollama binary.
   * - Dev: resources/ollama/<os>/ollama[.exe]
   * - Prod: process.resourcesPath/ollama/ollama[.exe]
   */
  private resolveBinaryPath(): string | null {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const platformDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';

    // Compiled location: dist-electron/electron/services/ollama-manager.js
    const candidates = app.isPackaged
      ? [path.join(process.resourcesPath, 'ollama', `ollama${ext}`)]
      : [
          // <root>/resources/ollama/<platform>/ollama
          path.join(__dirname, '..', '..', '..', 'resources', 'ollama', platformDir, `ollama${ext}`),
          path.join(process.cwd(), 'resources', 'ollama', platformDir, `ollama${ext}`),
        ];

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  /**
   * Check if Ollama is already running on the expected port.
   */
  async isReachable(timeoutMs = 1500): Promise<boolean> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(tid);
    }
  }

  /**
   * Wait until /api/tags responds successfully or timeout.
   */
  async waitForReady(timeoutMs = 30_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.isReachable()) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'external') return;

    this.state = 'starting';

    // If something is already on the port, reuse it.
    if (await this.isReachable()) {
      logger.info('External Ollama detected on 11434 — reusing');
      this.state = 'external';
      return;
    }

    const binary = this.resolveBinaryPath();
    if (!binary) {
      this.state = 'error';
      this.lastError =
        'Ollama binary not found. Run `node scripts/download-ollama.mjs` or install Ollama manually.';
      logger.error(this.lastError);
      throw new Error(this.lastError);
    }

    // Ensure binary is executable on POSIX
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(binary, 0o755);
      } catch (e) {
        logger.warn('Failed to chmod ollama binary', e);
      }
    }

    const env = {
      ...process.env,
      OLLAMA_HOST: `${OLLAMA_HOST}:${OLLAMA_PORT}`,
      OLLAMA_MODELS: paths.models(),
      // Reduce idle keep-alive in renderer-facing usage
      OLLAMA_KEEP_ALIVE: '5m',
    };

    logger.info('Spawning Ollama', { binary, models: env.OLLAMA_MODELS });
    this.child = spawn(binary, ['serve'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.child.stdout?.on('data', (d) => logger.debug('[ollama]', d.toString().trim()));
    this.child.stderr?.on('data', (d) => logger.debug('[ollama-err]', d.toString().trim()));

    this.child.on('exit', (code, sig) => {
      logger.warn('Ollama process exited', { code, sig });
      this.child = null;
      if (this.state !== 'idle') this.state = 'error';
    });

    const ready = await this.waitForReady(30_000);
    if (!ready) {
      this.state = 'error';
      this.lastError = 'Ollama failed to start within 30s';
      throw new Error(this.lastError);
    }

    this.state = 'ready';
    logger.info('Ollama ready');
  }

  async listModels(): Promise<OllamaModelInfo[]> {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string; size: number; modified_at: string }> };
    return (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
      installed: true,
    }));
  }

  async hasModel(name: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some((m) => m.name === name || m.name.startsWith(`${name.split(':')[0]}:`));
  }

  /**
   * Stream `/api/pull` and emit progress.
   */
  async pullModel(model: string, onProgress: (p: OllamaPullProgress) => void): Promise<void> {
    const res = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Pull failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line) as {
            status: string;
            digest?: string;
            total?: number;
            completed?: number;
            error?: string;
          };
          if (evt.error) throw new Error(evt.error);
          const percent =
            evt.total && evt.completed ? Math.round((evt.completed / evt.total) * 100) : undefined;
          onProgress({
            model,
            status: evt.status,
            digest: evt.digest,
            total: evt.total,
            completed: evt.completed,
            percent,
          });
        } catch (e) {
          logger.warn('Failed to parse pull stream line', { line, error: String(e) });
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.state = 'idle';
      return;
    }
    logger.info('Stopping Ollama process');
    try {
      if (process.platform === 'win32') {
        // SIGTERM doesn't propagate well on Windows. Try kill().
        this.child.kill();
      } else {
        this.child.kill('SIGTERM');
      }
    } catch (e) {
      logger.warn('Error killing ollama', e);
    }
    this.child = null;
    this.state = 'idle';
  }

  get baseUrl() {
    return OLLAMA_URL;
  }
}

export const ollamaManager = new OllamaManager();
