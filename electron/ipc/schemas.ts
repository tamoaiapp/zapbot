import { z } from 'zod';

export const ConversationIdSchema = z.object({ conversationId: z.string().min(1) });

export const ListMessagesSchema = z.object({
  conversationId: z.string().min(1),
  limit: z.number().int().positive().max(500).optional(),
  beforeTimestamp: z.number().int().positive().optional(),
});

export const SendManualSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(4000),
});

export const ToggleBotSchema = z.object({
  conversationId: z.string().min(1),
  enabled: z.boolean(),
});

export const CreateRuleSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(4000),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export const UpdateRuleSchema = CreateRuleSchema.partial().extend({
  id: z.number().int().positive(),
});

export const RuleIdSchema = z.object({ id: z.number().int().positive() });

export const ReorderRulesSchema = z.object({ orderedIds: z.array(z.number().int().positive()) });

export const CreateKeywordSchema = z.object({
  pattern: z.string().min(1).max(500),
  is_regex: z.boolean(),
  response_template: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
});

export const UpdateKeywordSchema = CreateKeywordSchema.partial().extend({
  id: z.number().int().positive(),
});

export const UpdateBotConfigSchema = z.object({
  system_prompt: z.string().optional(),
  business_context: z.string().optional(),
  model_name: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_context_messages: z.number().int().min(1).max(200).optional(),
  global_enabled: z.union([z.literal(0), z.literal(1)]).optional(),
  response_delay_ms: z.number().int().min(0).max(60000).optional(),
  bot_name: z.string().optional(),
  tone: z.enum(['formal', 'casual', 'divertido']).optional(),
});

export const CreateScheduledSchema = z.object({
  phone: z.string().regex(/^\d{10,15}$/, 'Phone must be digits only (E.164 without +)'),
  body: z.string().min(1).max(4000),
  scheduled_for: z.number().int().positive(),
  recurrence: z
    .union([z.literal('daily'), z.literal('weekly'), z.string().startsWith('cron:'), z.null()])
    .optional(),
  weekdays: z.string().nullable().optional(),
});

export const UpdateScheduledSchema = CreateScheduledSchema.partial().extend({
  id: z.number().int().positive(),
  status: z.enum(['pending', 'sent', 'failed', 'cancelled']).optional(),
});

export const PullModelSchema = z.object({ model: z.string().min(1) });
