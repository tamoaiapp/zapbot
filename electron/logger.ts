import log from 'electron-log/main';
import { app } from 'electron';
import path from 'node:path';

let initialized = false;

export function initLogger() {
  if (initialized) return;
  initialized = true;

  log.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', 'main.log');
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB rotation
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  log.transports.file.level = 'info';

  log.initialize();
  log.info('logger initialized', { userData: app.getPath('userData') });
}

export const logger = log;
