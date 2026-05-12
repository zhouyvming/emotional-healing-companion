import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db';
import { requireAuth, AuthError } from '$lib/server/auth';
import { datetimeNow } from '$lib/utils';
import type { RowDataPacket } from 'mysql2/promise';

interface ChatRow extends RowDataPacket {
  id: string;
  username: string;
  title: string;
  models: string;
  options: string;
  messages: string;
  history: string;
  system: string | null;
  timestamp: string;
}

export async function GET({ url, request }) {
  try {
    const auth = requireAuth(request);
    const limit = parseInt(url.searchParams.get('limit') ?? '100');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    const [rows] = await pool.query<ChatRow[]>(
      `SELECT id, title, models, timestamp FROM chats WHERE username = ? ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`,
      [auth.username]
    );
    return json(rows.map((row) => ({
      ...row,
      models: safeJsonParse(row.models),
    })));
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('获取会话列表错误:', error);
    return json({ error: '获取会话列表失败' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const auth = requireAuth(request);
    const chat = await request.json();

    if (!chat.id) {
      return json({ error: '缺少必要信息' }, { status: 400 });
    }

    await pool.execute(
      'INSERT INTO chats (id, username, title, models, options, messages, history, \`system\`, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) '
      + 'ON DUPLICATE KEY UPDATE title=VALUES(title), models=VALUES(models), options=VALUES(options), messages=VALUES(messages), history=VALUES(history), \`system\`=VALUES(\`system\`), timestamp=VALUES(timestamp)',
      [
        chat.id,
        auth.username,
        chat.title ?? 'New Chat',
        JSON.stringify(chat.models ?? []),
        JSON.stringify(chat.options ?? {}),
        JSON.stringify(chat.messages ?? []),
        JSON.stringify(chat.history ?? { messages: {}, currentId: null }),
        chat.system ?? null,
        chat.timestamp ?? datetimeNow()
      ]
    );
    return json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('创建/更新会话错误:', error);
    return json({ error: '操作失败' }, { status: 500 });
  }
}

export async function DELETE({ request }) {
  try {
    const auth = requireAuth(request);

    await pool.execute('DELETE FROM chats WHERE username = ?', [auth.username]);
    return json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('删除全部会话错误:', error);
    return json({ error: '删除失败' }, { status: 500 });
  }
}

function safeJsonParse(val: string | object) {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}
