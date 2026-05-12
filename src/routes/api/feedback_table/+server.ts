import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db';
import { requireAuth, AuthError } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const auth = requireAuth(request);
    const { content } = await request.json();

    if (!content) {
      return json({ error: '缺少必要信息' }, { status: 400 });
    }

    await pool.execute(
      'INSERT INTO feedback_table (username, content) VALUES (?, ?)',
      [auth.username, content]
    );

    return json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('提交反馈错误:', error);
    return json({ error: '操作失败，请稍后重试' }, { status: 500 });
  }
};
