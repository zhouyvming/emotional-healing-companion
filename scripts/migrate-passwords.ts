import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  port: 3307,
  database: 'webui_chat',
  charset: 'utf8mb4'
});

async function migratePasswords() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT id, username, password FROM users');
    console.log(`找到 ${rows.length} 个用户`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows as any[]) {
      const currentPassword = row.password;

      // 跳过已经是 bcrypt 哈希的密码（以 $2b$ 或 $2a$ 开头）
      if (currentPassword.startsWith('$2b$') || currentPassword.startsWith('$2a$')) {
        console.log(`  跳过 ${row.username} (已是哈希值)`);
        skipped++;
        continue;
      }

      console.log(`  迁移 ${row.username}: "${currentPassword}"`);

      const hashed = await bcrypt.hash(String(currentPassword), 10);
      await conn.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, row.id]);

      updated++;
    }

    console.log(`\n完成: ${updated} 个用户已迁移, ${skipped} 个已跳过`);
  } finally {
    conn.release();
    await pool.end();
  }
}

migratePasswords().catch(console.error);
