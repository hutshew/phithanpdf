import { env } from 'cloudflare:workers';

export const runtime = 'edge';

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET() {
  const db = env.DB;
  if (!db) {
    return jsonResponse({
      ok: true,
      configured: false,
      message: 'D1 binding DB is not configured',
      totals: [],
    });
  }

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

  const totals = await db.prepare(`
    SELECT
      tool_id AS toolId,
      status,
      COUNT(*) AS events,
      COALESCE(SUM(file_count), 0) AS fileCount,
      COALESCE(SUM(output_count), 0) AS outputCount
    FROM usage_events
    GROUP BY tool_id, status
    ORDER BY tool_id ASC, status ASC
  `).all();

  const last24Hours = await db.prepare(`
    SELECT
      tool_id AS toolId,
      status,
      COUNT(*) AS events
    FROM usage_events
    WHERE created_at >= datetime('now', '-1 day')
    GROUP BY tool_id, status
    ORDER BY tool_id ASC, status ASC
  `).all();

  return jsonResponse({
    ok: true,
    configured: true,
    totals: totals.results,
    last24Hours: last24Hours.results,
  });
}
