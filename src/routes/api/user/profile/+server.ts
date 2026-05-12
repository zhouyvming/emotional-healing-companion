import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db';
import { hashPassword, verifyPassword, requireAuth, signToken, AuthError } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2/promise';

interface User extends RowDataPacket {
  id: number;
  username: string;
  password: string;
  email: string;
  avatar: string | null;
  system_avatar: string | null;
}

export async function PUT({ request }) {
  try {
    const auth = requireAuth(request);
    const body = await request.json();
    const { avatar, systemAvatar, oldPassword, newPassword, newUsername, newEmail } = body;
    const username = auth.username;

    // 密码修改
    if (newPassword !== undefined) {
      if (!oldPassword) {
        return json({ error: '请输入当前密码' }, { status: 400 });
      }

      const [rows] = await pool.execute<User[]>(
        'SELECT password FROM users WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        return json({ error: '用户不存在' }, { status: 404 });
      }

      if (!(await verifyPassword(String(oldPassword), rows[0].password))) {
        return json({ error: '当前密码错误' }, { status: 401 });
      }

      const hashedPassword = await hashPassword(String(newPassword));
      await pool.execute(
        'UPDATE users SET password = ? WHERE username = ?',
        [hashedPassword, username]
      );

      return json({ success: true });
    }

    // 个人信息更新（用户名/邮箱/头像）
    if (newUsername !== undefined || newEmail !== undefined || avatar !== undefined || systemAvatar !== undefined) {
      if (newUsername !== undefined && newUsername !== username) {
        const [existing] = await pool.execute<User[]>(
          'SELECT id FROM users WHERE username = ?',
          [newUsername]
        );
        if (existing.length > 0) {
          return json({ error: '用户名已存在' }, { status: 400 });
        }
      }

      if (newEmail !== undefined) {
        const [existing] = await pool.execute<User[]>(
          'SELECT id FROM users WHERE email = ? AND username != ?',
          [newEmail, username]
        );
        if (existing.length > 0) {
          return json({ error: '邮箱已存在' }, { status: 400 });
        }
      }

      const updates: string[] = [];
      const params: (string | null)[] = [];

      if (newUsername !== undefined && newUsername !== username) {
        updates.push('username = ?');
        params.push(newUsername);
      }
      if (newEmail !== undefined) {
        updates.push('email = ?');
        params.push(newEmail);
      }
      if (avatar !== undefined) {
        updates.push('avatar = ?');
        params.push(avatar ?? null);
      }
      if (systemAvatar !== undefined) {
        updates.push('system_avatar = ?');
        params.push(systemAvatar ?? null);
      }

      const usernameChanged = newUsername !== undefined && newUsername !== username;

      if (updates.length > 0) {
        params.push(username);
        await pool.execute(
          `UPDATE users SET ${updates.join(', ')} WHERE username = ?`,
          params
        );

        // 如果用户名变更，同步更新 chats 表中的 username
        if (usernameChanged && newUsername) {
          await pool.execute(
            'UPDATE chats SET username = ? WHERE username = ?',
            [newUsername, username]
          );
        }
      }

      const lookupName = usernameChanged ? newUsername! : username;
      const [rows] = await pool.execute<User[]>(
        'SELECT id, username, email, avatar, system_avatar FROM users WHERE username = ?',
        [lookupName]
      );

      if (rows.length === 0) {
        return json({ error: '用户不存在' }, { status: 404 });
      }

      const responseData: any = {
        success: true,
        user: {
          id: rows[0].id,
          username: rows[0].username,
          email: rows[0].email,
          avatar: rows[0].avatar ?? null,
          system_avatar: rows[0].system_avatar ?? null
        }
      };

      // 用户名变更时签发新 token
      if (usernameChanged) {
        responseData.token = signToken({ userId: rows[0].id, username: rows[0].username });
      }

      return json(responseData);
    }

    // 头像更新（向后兼容）
    await pool.execute(
      'UPDATE users SET avatar = ? WHERE username = ?',
      [avatar ?? null, username]
    );
    return json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('更新用户资料错误:', error);
    return json({ error: '更新失败，请稍后重试' }, { status: 500 });
  }
}
