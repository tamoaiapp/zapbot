import { app, BrowserWindow, Notification, shell } from 'electron';
import path from 'node:path';
import { initLogger, logger } from './logger';
import { initDb } from './services/db';
import { ollamaManager } from './services/ollama-manager';
import { whatsapp } from './services/whatsapp';
import { startScheduler, stopScheduler } from './services/scheduler';
import { registerInboxIpc } from './ipc/inbox';
import { registerConfigIpc } from './ipc/config';
import { registerSchedulerIpc } from './ipc/scheduler';
import { registerSystemIpc, buildSystemStatus } from './ipc/system';
import { IpcChannels } from '../shared/types';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

function broadcast(channel: string, payload?: unknown) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f0f2f5',
    autoHideMenuBar: true,
    title: 'ZapBot',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // __dirname in compiled: dist-electron/electron — renderer lives at <root>/dist
    await mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function wireDomainEvents() {
  whatsapp.on('status', async () => {
    const status = await buildSystemStatus();
    broadcast(IpcChannels.EVT_STATUS_CHANGED, status);
  });

  whatsapp.on('qr', async () => {
    const status = await buildSystemStatus();
    broadcast(IpcChannels.EVT_STATUS_CHANGED, status);
  });

  whatsapp.on('message-new', (msg) => {
    broadcast(IpcChannels.EVT_MESSAGE_NEW, msg);
  });

  whatsapp.on('message-updated', (u) => {
    broadcast(IpcChannels.EVT_MESSAGE_UPDATED, u);
  });

  whatsapp.on('conversation-updated', (jid) => {
    broadcast(IpcChannels.EVT_CONVERSATION_UPDATED, jid);
  });
}

async function bootstrap() {
  initLogger();
  logger.info('ZapBot starting', { isDev, version: app.getVersion() });

  initDb();

  registerInboxIpc();
  registerConfigIpc();
  registerSchedulerIpc();
  registerSystemIpc();

  wireDomainEvents();

  await createWindow();

  // Start Ollama in background (don't block window)
  ollamaManager
    .start()
    .then(async () => {
      const status = await buildSystemStatus();
      broadcast(IpcChannels.EVT_STATUS_CHANGED, status);
    })
    .catch((e) => {
      logger.error('Ollama failed to start', e);
      broadcast(IpcChannels.EVT_TOAST, {
        type: 'error',
        title: 'Ollama indisponível',
        description: e instanceof Error ? e.message : String(e),
      });
    });

  // Start WhatsApp connection
  whatsapp.start().catch((e) => {
    logger.error('WhatsApp failed to start', e);
  });

  // Start scheduler tick
  startScheduler();
}

app.whenReady().then(bootstrap).catch((e) => {
  logger.error('Bootstrap failed', e);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async (e) => {
  logger.info('Shutting down');
  stopScheduler();
  try {
    await whatsapp.stop();
  } catch (err) {
    logger.warn('Failed to stop whatsapp cleanly', err);
  }
  try {
    await ollamaManager.stop();
  } catch (err) {
    logger.warn('Failed to stop ollama cleanly', err);
  }
});

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Reference Notification to keep import for future use (escalation desktop notification)
export function notifyEscalation(title: string, body: string) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}
