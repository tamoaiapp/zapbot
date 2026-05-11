import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/types';
import {
  createKeyword,
  createRule,
  deleteKeyword,
  deleteRule,
  getBotConfig,
  listKeywords,
  listRules,
  reorderRules,
  updateBotConfig,
  updateKeyword,
  updateRule,
} from '../services/db';
import { invalidateKeywordCache } from '../services/keyword-matcher';
import {
  CreateKeywordSchema,
  CreateRuleSchema,
  ReorderRulesSchema,
  RuleIdSchema,
  UpdateBotConfigSchema,
  UpdateKeywordSchema,
  UpdateRuleSchema,
} from './schemas';

export function registerConfigIpc() {
  // Bot config
  ipcMain.handle(IpcChannels.CONFIG_GET_BOT, () => getBotConfig());
  ipcMain.handle(IpcChannels.CONFIG_UPDATE_BOT, (_e, patch) => {
    const parsed = UpdateBotConfigSchema.parse(patch);
    return updateBotConfig(parsed);
  });

  // Rules
  ipcMain.handle(IpcChannels.CONFIG_LIST_RULES, () => listRules());
  ipcMain.handle(IpcChannels.CONFIG_CREATE_RULE, (_e, args) =>
    createRule(CreateRuleSchema.parse(args))
  );
  ipcMain.handle(IpcChannels.CONFIG_UPDATE_RULE, (_e, args) =>
    updateRule(UpdateRuleSchema.parse(args))
  );
  ipcMain.handle(IpcChannels.CONFIG_DELETE_RULE, (_e, args) => {
    const { id } = RuleIdSchema.parse(args);
    deleteRule(id);
    return { ok: true };
  });
  ipcMain.handle(IpcChannels.CONFIG_REORDER_RULES, (_e, args) => {
    const { orderedIds } = ReorderRulesSchema.parse(args);
    reorderRules(orderedIds);
    return { ok: true };
  });

  // Keywords
  ipcMain.handle(IpcChannels.CONFIG_LIST_KEYWORDS, () => listKeywords());
  ipcMain.handle(IpcChannels.CONFIG_CREATE_KEYWORD, (_e, args) => {
    const out = createKeyword(CreateKeywordSchema.parse(args));
    invalidateKeywordCache();
    return out;
  });
  ipcMain.handle(IpcChannels.CONFIG_UPDATE_KEYWORD, (_e, args) => {
    const out = updateKeyword(UpdateKeywordSchema.parse(args));
    invalidateKeywordCache();
    return out;
  });
  ipcMain.handle(IpcChannels.CONFIG_DELETE_KEYWORD, (_e, args) => {
    const { id } = RuleIdSchema.parse(args);
    deleteKeyword(id);
    invalidateKeywordCache();
    return { ok: true };
  });
}
