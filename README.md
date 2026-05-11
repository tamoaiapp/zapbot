# ZapBot

Atendente WhatsApp automatizado com LLM local. Tudo roda offline na máquina do usuário — sem nuvem, sem servidor.

## Stack

- Electron 32 + React 18 + Vite + TailwindCSS
- Baileys (WhatsApp Web protocol, sem Chromium)
- Ollama + Qwen2.5 (LLM local)
- SQLite via better-sqlite3
- node-cron para agendamentos

## Desenvolvimento

```bash
npm install      # baixa Ollama automaticamente via postinstall
npm run dev      # roda Vite (5173) + Electron simultaneamente
```

## Build

```bash
npm run build:win    # NSIS installer
npm run build:mac    # DMG
npm run build:linux  # AppImage
```

## Arquitetura

Veja [CLAUDE.md](./CLAUDE.md) para a documentação completa.

```
electron/   → processo main (Baileys, Ollama, SQLite, IPC)
src/        → renderer React (Inbox, Config, Scheduler, Settings)
resources/  → binário Ollama portátil (baixado em postinstall)
scripts/    → utilitários (download-ollama.mjs)
```

## Variáveis úteis

- `userData/` (Windows: `%APPDATA%/ZapBot`, mac: `~/Library/Application Support/ZapBot`)
  - `zapbot.db` — banco SQLite
  - `baileys-auth/` — credenciais do WhatsApp
  - `media/` — anexos baixados
  - `models/` — modelos do Ollama
  - `logs/` — `electron-log`

## Riscos

Baileys é não-oficial. **Use uma conta de WhatsApp dedicada**, não a pessoal.
