/*
 MySQL connection pool using mysql2/promise.
 Reads environment variables:
 - DB_HOST
 - DB_PORT
 - DB_USER
 - DB_PASSWORD
 - DB_NAME
 - DB_CONNECTION_LIMIT (optional)
*/
const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "clinicare",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});

module.exports = { pool };
