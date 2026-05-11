import { logger } from '../logger';
import { ollamaManager } from './ollama-manager';
import { getBotConfig, getRecentMessagesAsc, listEnabledRules } from './db';
import type { BotConfig, Message, Rule } from '../../shared/types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(cfg: BotConfig, rules: Rule[]): string {
  const rulesBlock =
    rules.length === 0
      ? '(nenhuma regra adicional)'
      : rules
          .map((r, i) => `${i + 1}. ${r.content}`)
          .join('\n');

  const toneText =
    cfg.tone === 'formal'
      ? 'formal e profissional'
      : cfg.tone === 'divertido'
        ? 'descontraído e amigável, com leveza'
        : 'casual e cordial';

  const hasContext = !!cfg.business_context?.trim();
  const contextBlock = hasContext
    ? `CONTEXTO DO NEGÓCIO (única fonte de verdade — qualquer informação fora daqui você NÃO conhece):\n${cfg.business_context!.trim()}\n`
    : `CONTEXTO DO NEGÓCIO: (vazio — você não sabe nada sobre este negócio ainda)\n`;

  const noContextGuard = hasContext
    ? ''
    : `\nIMPORTANTE: o contexto do negócio está vazio. Você NÃO tem informações sobre produtos, preços, prazos, políticas, transações, pagamentos ou qualquer fato específico. Não invente. Se o cliente perguntar qualquer coisa específica, responda apenas: "Deixa eu verificar isso e já te respondo, ok?" — sem fingir que está checando, sem prometer prazo, sem dar detalhes.`;

  return `Você é ${cfg.bot_name ?? 'um atendente virtual'}, atendente automático via WhatsApp.

${contextBlock}REGRAS (siga rigorosamente):
${rulesBlock}

ESTILO:
- Responda APENAS à última mensagem do cliente, considerando todo o histórico acima.
- Português brasileiro, máximo 3 frases curtas.
- Tom: ${toneText}.
- NUNCA invente preços, prazos, produtos, transações ou políticas que não estejam no CONTEXTO acima.
- NUNCA prometa que vai "verificar agora", "checar o sistema" ou ações específicas que você não pode fazer de fato.
- Se o cliente trouxer um problema concreto (cobrança, conta, transação), nunca diga que vai resolver — diga apenas: "Vou passar isso pra equipe responsável e já te retorno".
- Não se identifique como IA, robô ou assistente virtual — fale como atendente humano.${noContextGuard}`;
}

function historyToChat(history: Message[]): ChatMessage[] {
  return history
    .filter((m) => m.body && m.body.trim().length > 0)
    .map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.body,
    }));
}

export async function generateReply(conversationId: string): Promise<string> {
  const cfg = getBotConfig();
  const rules = listEnabledRules();
  const history = getRecentMessagesAsc(conversationId, cfg.max_context_messages);

  const systemPrompt = buildSystemPrompt(cfg, rules);
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyToChat(history),
  ];

  logger.info('LLM generate', {
    conversationId,
    historyLen: history.length,
    model: cfg.model_name,
  });

  const res = await fetch(`${ollamaManager.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model_name,
      messages,
      stream: false,
      options: {
        temperature: cfg.temperature,
        num_ctx: 4096,
        num_predict: 256,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Ollama chat failed: ${res.status} ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content?.trim() ?? '';
  if (!content) throw new Error('Empty LLM response');
  return content;
}

/**
 * Make sure the configured model is present locally. If not, throw.
 * The renderer is responsible for triggering the pull flow.
 */
export async function ensureModelAvailable(): Promise<boolean> {
  const cfg = getBotConfig();
  return ollamaManager.hasModel(cfg.model_name);
}
