import { app, BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { logger } from "../logger";

/**
 * Initialize auto-update against GitHub Releases (tamoaiapp/zapbot).
 *
 * Flow:
 *   1. App starts → after 5s, check for updates in background
 *   2. If newer version exists on GitHub Releases → download silently
 *   3. When download finishes → prompt user to restart (one-click install)
 *
 * Re-checks every 6 hours while the app is running.
 *
 * No-op in dev mode (we're not running from a packaged binary).
 */
export function initAutoUpdater() {
  if (!app.isPackaged) {
    logger.info("Auto-update disabled in dev mode");
    return;
  }

  // Pipe electron-updater logs through electron-log
  autoUpdater.logger = logger as any;
  autoUpdater.autoDownload = true;       // download as soon as we detect an update
  autoUpdater.autoInstallOnAppQuit = true; // install when user closes the app

  autoUpdater.on("checking-for-update", () => {
    logger.info("[updater] checking for update");
  });

  autoUpdater.on("update-available", (info) => {
    logger.info("[updater] update available", { version: info.version });
    broadcast("update-available", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    logger.info("[updater] no update available");
  });

  autoUpdater.on("error", (err) => {
    logger.error("[updater] error", err?.message ?? err);
  });

  autoUpdater.on("download-progress", (progress) => {
    logger.debug("[updater] download progress", {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
    });
    broadcast("update-progress", Math.round(progress.percent));
  });

  autoUpdater.on("update-downloaded", async (info) => {
    logger.info("[updater] update downloaded", { version: info.version });
    broadcast("update-ready", info.version);

    const choice = await dialog.showMessageBox({
      type: "info",
      buttons: ["Reiniciar e atualizar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
      title: "Atualização disponível",
      message: `ZapBot ${info.version} foi baixado.`,
      detail: "A atualização será aplicada ao reiniciar o app. Quer reiniciar agora?",
    });

    if (choice.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
    // If user chose "Depois", the update will install automatically when the app quits.
  });

  // First check after a short delay so the window has time to render.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => logger.warn("Initial update check failed", e));
  }, 5_000);

  // Re-check every 6 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((e) => logger.warn("Periodic update check failed", e));
    },
    6 * 60 * 60 * 1000,
  );
}

function broadcast(channel: string, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(`updater:${channel}`, payload);
  });
}
