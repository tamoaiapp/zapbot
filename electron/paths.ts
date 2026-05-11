import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export function userDataPath(...segments: string[]): string {
  return path.join(app.getPath('userData'), ...segments);
}

export function ensureDir(p: string): string {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

export function appResourcesPath(...segments: string[]): string {
  // Compiled location: dist-electron/electron/paths.js
  // In production: process.resourcesPath
  // In dev: project root (two levels up from compiled file)
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', '..');
  return path.join(base, ...segments);
}

export const paths = {
  db: () => userDataPath('zapbot.db'),
  baileysAuth: () => ensureDir(userDataPath('baileys-auth')),
  media: () => ensureDir(userDataPath('media')),
  models: () => ensureDir(userDataPath('models')),
  logs: () => ensureDir(userDataPath('logs')),
  ollama: () => ensureDir(userDataPath('ollama')),
};
