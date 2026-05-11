// One-off: remove "[Mensagem não suportada]" rows that were inserted before
// the message-type filter landed. Uses Node's built-in sqlite (Node 22.5+).
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'zapbot', 'zapbot.db');
const db = new DatabaseSync(dbPath);

const stmt = db.prepare(
  "DELETE FROM messages WHERE body = '[Mensagem não suportada]' OR body = '[Áudio recebido]'"
);
const result = stmt.run();

console.log(`Removed ${result.changes} phantom messages from ${dbPath}`);
db.close();
