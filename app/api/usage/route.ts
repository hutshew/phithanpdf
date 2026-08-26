import { env } from 'cloudflare:workers';

export const runtime = 'edge';

const allowedToolIds = new Set([
  'site-visit',
  'merge',
  'organize',
  'split',
  'pdf-to-jpg',
  'jpg-to-pdf',
  'pdf-to-excel',
  'pdf-to-word',
  'pdf-to-powerpoint',
  'password',
  'sign',
  'annotate',
  'watermark',
]);

const allowedStatuses = new Set(['success', 'error']);

type UsagePayload = {
  toolId?: unknown;
  status?: unknown;
  fileCount?: unknown;
  outputCount?: unknown;
  errorCode?: unknown;
  path?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function toSafeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(value), 999));
}

function toSafeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/[^\w\-./#?=&:]/g, '').slice(0, maxLength);
}

async function ensureUsageTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id TEXT NOT NULL,
      status TEXT NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      output_count INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      path TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `).run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_usage_events_tool_status ON usage_events(tool_id, status)').run();
}

export async function POST(request: Request) {
  let payload: UsagePayload;

  try {
    payload = await request.json() as UsagePayload;
  } catch {
    return jsonResponse({ ok: false, message: 'Invalid JSON' }, 400);
  }

  const toolId = typeof payload.toolId === 'string' ? payload.toolId : '';
  const status = typeof payload.status === 'string' ? payload.status : '';

  if (!allowedToolIds.has(toolId) || !allowedStatuses.has(status)) {
    return jsonResponse({ ok: false, message: 'Invalid usage event' }, 400);
  }

  const db = env.DB;
  if (!db) {
    return jsonResponse({ ok: true, persisted: false, message: 'D1 binding DB is not configured' });
  }

  await ensureUsageTable(db);

  await db.prepare(`
    INSERT INTO usage_events (tool_id, status, file_count, output_count, error_code, path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    toolId,
    status,
    toSafeInteger(payload.fileCount),
    toSafeInteger(payload.outputCount),
    toSafeText(payload.errorCode, 80) || null,
    toSafeText(payload.path, 180) || null,
  ).run();

  return jsonResponse({ ok: true, persisted: true });
}
