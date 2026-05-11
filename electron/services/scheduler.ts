import cron from 'node-cron';
import { logger } from '../logger';
import {
  getDueScheduled,
  rescheduleNext,
  setScheduledStatus,
} from './db';
import { whatsapp } from './whatsapp';
import type { ScheduledMessage } from '../../shared/types';

const MAX_ATTEMPTS = 3;
const HOURLY_SEND_CAP = 30; // safety: max msgs/hour to reduce ban risk

let task: cron.ScheduledTask | null = null;
let sentThisHour = 0;
let hourBucket = Math.floor(Date.now() / 3_600_000);

function bumpHourBucket() {
  const now = Math.floor(Date.now() / 3_600_000);
  if (now !== hourBucket) {
    hourBucket = now;
    sentThisHour = 0;
  }
}

/**
 * Compute the next firing timestamp for a recurring schedule.
 * - 'daily': +24h
 * - 'weekly': next weekday from `weekdays` (CSV "0,1,2..."), same time
 * - 'cron:<expr>': v1 not implemented — fallback to +24h
 */
function computeNext(item: ScheduledMessage, fromTs: number): number | null {
  if (!item.recurrence) return null;

  if (item.recurrence === 'daily') {
    return fromTs + 24 * 60 * 60 * 1000;
  }

  if (item.recurrence === 'weekly') {
    const days = (item.weekdays ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
    if (days.length === 0) return fromTs + 7 * 24 * 60 * 60 * 1000;

    const d = new Date(fromTs);
    for (let i = 1; i <= 7; i++) {
      const candidate = new Date(d);
      candidate.setDate(d.getDate() + i);
      if (days.includes(candidate.getDay())) return candidate.getTime();
    }
    return fromTs + 7 * 24 * 60 * 60 * 1000;
  }

  if (item.recurrence.startsWith('cron:')) {
    // v1: skip cron expressions for re-scheduling; just fire once
    return null;
  }

  return null;
}

async function processDue() {
  bumpHourBucket();

  if (!whatsapp.isOpen()) {
    return; // wait until next tick
  }

  const due = getDueScheduled(Date.now());
  if (due.length === 0) return;

  for (const item of due) {
    if (sentThisHour >= HOURLY_SEND_CAP) {
      logger.warn('Hourly send cap reached, deferring remaining scheduled messages');
      break;
    }

    try {
      await whatsapp.sendToPhone(item.phone, item.body, 'scheduled');
      sentThisHour++;

      const next = computeNext(item, item.scheduled_for);
      if (next) {
        rescheduleNext(item.id, next);
      } else {
        setScheduledStatus(item.id, 'sent');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Scheduled send failed', { id: item.id, error: msg });
      const newAttempts = item.attempts + 1;
      if (newAttempts >= MAX_ATTEMPTS) {
        setScheduledStatus(item.id, 'failed', msg, true);
      } else {
        // Defer next attempt by exponential backoff
        const backoff = Math.min(15 * 60_000, 30_000 * Math.pow(2, newAttempts));
        rescheduleNext(item.id, Date.now() + backoff);
        setScheduledStatus(item.id, 'pending', msg, true);
      }
    }
  }
}

export function startScheduler() {
  if (task) return;
  // Every 30 seconds: */30 in seconds field
  task = cron.schedule('*/30 * * * * *', () => {
    processDue().catch((e) => logger.error('Scheduler tick failed', e));
  });
  logger.info('Scheduler started (tick every 30s)');
}

export function stopScheduler() {
  task?.stop();
  task = null;
}
