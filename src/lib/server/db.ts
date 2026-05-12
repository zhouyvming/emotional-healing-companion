import mysql from 'mysql2/promise';

// 创建MySQL连接
export const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  port: 3307,
  database: 'webui_chat',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 初始化数据库表
pool.execute(`CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT '',
  avatar LONGTEXT,
  INDEX idx_users_username (username)
)`).catch((err) => console.error('users table init error:', err));

// 为已有 users 表补充 avatar 列
pool.execute(`ALTER TABLE users ADD COLUMN avatar LONGTEXT`).catch(() => {});

// 为已有 users 表补充 system_avatar 列
pool.execute(`ALTER TABLE users ADD COLUMN system_avatar LONGTEXT`).catch(() => {});

// 将 password 列从 INT 改为 VARCHAR(255) 以支持 bcrypt 哈希
pool.execute(`ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NOT NULL`).catch(() => {});

pool.execute(`CREATE TABLE IF NOT EXISTS chats (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  title VARCHAR(255) DEFAULT 'New Chat',
  models JSON,
  options JSON,
  messages JSON,
  history JSON,
  \`system\` TEXT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_timestamp (timestamp)
)`).catch((err) => console.error('chats table init error:', err));

// 将 timestamp 列从 BIGINT 迁移为 DATETIME
pool.execute(`UPDATE chats SET timestamp = FROM_UNIXTIME(timestamp / 1000) WHERE timestamp > 1000000000000`).catch(() => {});
pool.execute(`ALTER TABLE chats MODIFY COLUMN timestamp DATETIME NOT NULL`).catch(() => {});

pool.execute(`CREATE TABLE IF NOT EXISTS feedback_table (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).catch((err) => console.error('feedback_table init error:', err));

pool.execute(`CREATE TABLE IF NOT EXISTS advice_table (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).catch((err) => console.error('advice_table init error:', err));
