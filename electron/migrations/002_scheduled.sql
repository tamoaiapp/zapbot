CREATE TABLE scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for INTEGER NOT NULL,
  recurrence TEXT,
  weekdays TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_sched_due ON scheduled_messages(scheduled_for) WHERE status = 'pending';
