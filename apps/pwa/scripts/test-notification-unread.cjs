const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const runtimeFile = path.join(__dirname, '.notification-unread.runtime.test.ts')
const runtimeTest = `
import { markNotificationRead, archiveNotification, unarchiveNotification, countUnread, dashboardUnreadCacheKey } from '../src/lib/notificationState.ts';

const t1 = { id: 'a', is_read: false, status: 'sent' };
const t2 = { id: 'b', is_read: false, status: 'sent' };
const t3 = { id: 'c', is_read: true, status: 'read' };
const items = [t1, t2, t3];

// CASE 1: unread -> open -> read, count decrements once.
const now = '2026-08-24T10:00:00.000Z';
let next = markNotificationRead(items, 'a', now);
if (countUnread(next) !== 1) throw new Error('CASE 1: count should be 1 after marking one');
const a = next.find(n => n.id === 'a');
if (!a || a.is_read !== true || a.status !== 'read' || a.read_at !== now) throw new Error('CASE 1: marked item is_read/status/read_at wrong');

// CASE 2: opening already-read item does not decrement again.
const alreadyRead = next.find(n => n.id === 'a')!;
let still = markNotificationRead(next, 'a', now);
if (countUnread(still) !== 1) throw new Error('CASE 2: count must stay 1 for already-read item');

// CASE 3: archive does not set is_read, but removes from count.
let archived = archiveNotification(next, 'b');
const b = archived.find(n => n.id === 'b');
if (!b || b.status !== 'archived') throw new Error('CASE 3: archived item status wrong');
if (b.is_read !== false) throw new Error('CASE 3: archive must not alter is_read');
if (countUnread(archived) !== 0) throw new Error('CASE 3: count should be 0 after archiving remaining unread');

// CASE 4: unarchive restores read state.
let unarchived = unarchiveNotification(archived, 'b', now);
const b2 = unarchived.find(n => n.id === 'b');
if (!b2 || b2.is_read !== true || b2.status !== 'read') throw new Error('CASE 4: unarchived item must be read');

// CASE 5: dashboard cache key is stable.
const key1 = dashboardUnreadCacheKey('u-1');
const key2 = dashboardUnreadCacheKey('u-1');
if (key1.join('|') !== key2.join('|')) throw new Error('CASE 5: cache key unstable');

console.log('Notification unread state: PASS');
`;

fs.writeFileSync(runtimeFile, runtimeTest);
try {
  execSync(`node --experimental-transform-types "${runtimeFile}"`, { cwd: __dirname, stdio: 'inherit' });
} finally {
  try { fs.unlinkSync(runtimeFile) } catch {}
}
