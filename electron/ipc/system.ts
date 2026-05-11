import { ipcMain, shell, BrowserWindow } from 'electron';
import { IpcChannels, SystemStatus } from '../../shared/types';
import { whatsapp } from '../services/whatsapp';
import { ollamaManager } from '../services/ollama-manager';
import { getBotConfig } from '../services/db';
import { paths } from '../paths';
import { PullModelSchema } from './schemas';
import { logger } from '../logger';

async function buildSystemStatus(): Promise<SystemStatus> {
  const ollamaState = ollamaManager.getState();
  const cfg = getBotConfig();
  const waState = whatsapp.getStatus();

  let modelInstalled = false;
  try {
    modelInstalled = await ollamaManager.hasModel(cfg.model_name);
  } catch {
    modelInstalled = false;
  }

  return {
    ollama:
      ollamaState.state === 'ready' || ollamaState.state === 'external'
        ? 'ready'
        : ollamaState.state === 'starting'
          ? 'starting'
          : 'error',
    whatsapp: waState.status,
    qr: waState.qr,
    current_model: cfg.model_name,
    model_installed: modelInstalled,
  };
}

export function registerSystemIpc() {
  ipcMain.handle(IpcChannels.SYSTEM_STATUS, () => buildSystemStatus());

  ipcMain.handle(IpcChannels.SYSTEM_LOGOUT, async () => {
    await whatsapp.logout();
    return { ok: true };
  });

  ipcMain.handle(IpcChannels.SYSTEM_OPEN_LOGS, async () => {
    await shell.openPath(paths.logs());
    return { ok: true };
  });

  ipcMain.handle(IpcChannels.OLLAMA_LIST_MODELS, () => ollamaManager.listModels());

  ipcMain.handle(IpcChannels.OLLAMA_PULL_MODEL, async (e, args) => {
    const { model } = PullModelSchema.parse(args);
    const win = BrowserWindow.fromWebContents(e.sender);
    logger.info('Pull model start', { model });
    try {
      await ollamaManager.pullModel(model, (progress) => {
        win?.webContents.send(IpcChannels.OLLAMA_PULL_PROGRESS, progress);
      });
      win?.webContents.send(IpcChannels.OLLAMA_PULL_PROGRESS, {
        model,
        status: 'success',
        percent: 100,
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      win?.webContents.send(IpcChannels.OLLAMA_PULL_PROGRESS, {
        model,
        status: `error: ${message}`,
      });
      throw err;
    }
  });
}

export { buildSystemStatus };
