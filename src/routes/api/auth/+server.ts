import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db';
import { hashPassword, verifyPassword, signToken } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2/promise';

interface User extends RowDataPacket {
  id: number;
  username: string;
  password: string;
  email: string;
  avatar: string | null;
  system_avatar: string | null;
}

export async function POST({ request }) {
  const { action, username, password, email } = await request.json();

  if (action === 'register') {
    try {
      const [existingUsers] = await pool.execute<User[]>(
        'SELECT username FROM users WHERE username = ?',
        [username]
      );

      if (existingUsers.length > 0) {
        return json({ error: '用户名已存在' }, { status: 400 });
      }

      const [existingEmails] = await pool.execute<User[]>(
        'SELECT email FROM users WHERE email = ?',
        [email]
      );

      if (existingEmails.length > 0) {
        return json({ error: '邮箱已存在' }, { status: 400 });
      }

      const hashedPassword = await hashPassword(String(password));

      await pool.execute(
        'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
        [username, hashedPassword, email]
      );

      return json({ success: true });
    } catch (error) {
      console.error('注册错误:', error);
      return json({ error: '注册失败，请稍后重试' }, { status: 500 });
    }
  }

  if (action === 'login') {
    try {
      const [rows] = await pool.execute<User[]>(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );
      const user = rows[0];

      if (!user || !(await verifyPassword(String(password), user.password))) {
        return json({ error: '用户名或密码错误' }, { status: 401 });
      }

      const token = signToken({ userId: user.id, username: user.username });

      return json({
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar ?? null,
        system_avatar: user.system_avatar ?? null,
        token
      });
    } catch (error) {
      console.error('登录错误:', error);
      return json({ error: '登录失败，请稍后重试' }, { status: 500 });
    }
  }
}
