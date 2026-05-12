import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db';
import { requireAuth, AuthError } from '$lib/server/auth';
import { datetimeNow } from '$lib/utils';
import type { RowDataPacket } from 'mysql2/promise';
import type { RequestHandler } from './$types';

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

export const GET: RequestHandler = async ({ params, request }) => {
  try {
    const auth = requireAuth(request);

    const [rows] = await pool.execute<ChatRow[]>(
      'SELECT * FROM chats WHERE id = ? AND username = ?',
      [params.id, auth.username]
    );
    if (rows.length === 0) {
      return json({ error: '会话不存在' }, { status: 404 });
    }
    const row = rows[0];
    return json({
      ...row,
      models: safeJsonParse(row.models),
      options: safeJsonParse(row.options),
      messages: safeJsonParse(row.messages),
      history: safeJsonParse(row.history),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('获取会话错误:', error);
    return json({ error: '获取会话失败' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const auth = requireAuth(request);
    const updated = await request.json();

    const [rows] = await pool.execute<ChatRow[]>(
      'SELECT * FROM chats WHERE id = ? AND username = ?',
      [params.id, auth.username]
    );
    if (rows.length === 0) {
      return json({ error: '会话不存在' }, { status: 404 });
    }

    const chat = rows[0];
    await pool.execute(
      'UPDATE chats SET title = ?, models = ?, options = ?, messages = ?, history = ?, \`system\` = ?, timestamp = ? WHERE id = ?',
      [
        updated.title ?? chat.title,
        JSON.stringify(updated.models !== undefined ? updated.models : safeJsonParse(chat.models)),
        JSON.stringify(updated.options !== undefined ? updated.options : safeJsonParse(chat.options)),
        JSON.stringify(updated.messages !== undefined ? updated.messages : safeJsonParse(chat.messages)),
        JSON.stringify(updated.history !== undefined ? updated.history : safeJsonParse(chat.history)),
        updated.system !== undefined ? updated.system : chat.system,
        updated.timestamp ?? datetimeNow(),
        params.id
      ]
    );
    return json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('更新会话错误:', error);
    return json({ error: '更新失败' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params, request }) => {
  try {
    const auth = requireAuth(request);

    await pool.execute('DELETE FROM chats WHERE id = ? AND username = ?', [params.id, auth.username]);
    return json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('删除会话错误:', error);
    return json({ error: '删除失败' }, { status: 500 });
  }
};

function safeJsonParse(val: string | object) {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}
