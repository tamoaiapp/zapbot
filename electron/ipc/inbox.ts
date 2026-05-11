import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/types';
import {
  getMessages,
  listConversations,
  markRead,
  setBotEnabled,
  setEscalated,
} from '../services/db';
import { whatsapp } from '../services/whatsapp';
import { ListMessagesSchema, SendManualSchema, ToggleBotSchema, ConversationIdSchema } from './schemas';
import { logger } from '../logger';

export function registerInboxIpc() {
  ipcMain.handle(IpcChannels.INBOX_LIST_CONVERSATIONS, () => {
    return listConversations();
  });

  ipcMain.handle(IpcChannels.INBOX_GET_MESSAGES, (_e, args) => {
    const parsed = ListMessagesSchema.parse(args);
    // Return ASC for chat rendering
    return getMessages(parsed.conversationId, parsed.limit ?? 50, parsed.beforeTimestamp)
      .slice()
      .reverse();
  });

  ipcMain.handle(IpcChannels.INBOX_SEND_MANUAL, async (_e, args) => {
    const parsed = SendManualSchema.parse(args);
    // Manual send => human is taking over
    setBotEnabled(parsed.conversationId, false);
    const msg = await whatsapp.send(parsed.conversationId, parsed.body, 'human');
    logger.info('Manual message sent', { conversationId: parsed.conversationId, len: parsed.body.length });
    return msg;
  });

  ipcMain.handle(IpcChannels.INBOX_TOGGLE_BOT, (_e, args) => {
    const parsed = ToggleBotSchema.parse(args);
    setBotEnabled(parsed.conversationId, parsed.enabled);
    if (parsed.enabled) {
      // Re-enabling bot also resets escalation
      setEscalated(parsed.conversationId, null);
    }
    return { ok: true };
  });

  ipcMain.handle(IpcChannels.INBOX_RESET_ESCALATION, (_e, args) => {
    const parsed = ConversationIdSchema.parse(args);
    setEscalated(parsed.conversationId, null);
    return { ok: true };
  });

  ipcMain.handle(IpcChannels.INBOX_MARK_READ, (_e, args) => {
    const parsed = ConversationIdSchema.parse(args);
    markRead(parsed.conversationId);
    return { ok: true };
  });
}
