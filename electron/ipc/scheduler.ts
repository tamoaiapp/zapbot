import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/types';
import {
  createScheduled,
  deleteScheduled,
  listScheduled,
  setScheduledStatus,
  updateScheduled,
} from '../services/db';
import { CreateScheduledSchema, RuleIdSchema, UpdateScheduledSchema } from './schemas';

export function registerSchedulerIpc() {
  ipcMain.handle(IpcChannels.SCHED_LIST, () => listScheduled());

  ipcMain.handle(IpcChannels.SCHED_CREATE, (_e, args) =>
    createScheduled(CreateScheduledSchema.parse(args))
  );

  ipcMain.handle(IpcChannels.SCHED_UPDATE, (_e, args) =>
    updateScheduled(UpdateScheduledSchema.parse(args))
  );

  ipcMain.handle(IpcChannels.SCHED_DELETE, (_e, args) => {
    const { id } = RuleIdSchema.parse(args);
    deleteScheduled(id);
    return { ok: true };
  });

  ipcMain.handle(IpcChannels.SCHED_PAUSE, (_e, args) => {
    const { id } = RuleIdSchema.parse(args);
    setScheduledStatus(id, 'cancelled');
    return { ok: true };
  });

  ipcMain.handle(IpcChannels.SCHED_RESUME, (_e, args) => {
    const { id } = RuleIdSchema.parse(args);
    setScheduledStatus(id, 'pending');
    return { ok: true };
  });
}
