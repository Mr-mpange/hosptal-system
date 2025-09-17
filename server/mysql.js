// ESM MySQL connection pool using mysql2/promise
// Reads env from .env via dotenv/config side-effect import
import 'dotenv/config';
import mysql from 'mysql2/promise';

const passwordRaw = process.env.DB_PASSWORD;
// If password is missing or only whitespace, treat as undefined (no password)
const password = passwordRaw && passwordRaw.trim() !== '' ? passwordRaw : undefined;

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  ...(password !== undefined ? { password } : {}),
  database: process.env.DB_NAME || 'clinicare',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});
