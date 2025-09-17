/*
 Express server with MySQL connection pooling and basic routes.
 - Loads env from .env
 - CORS enabled for local dev
 - JSON body parsing
 - Health check and example /api/ping
 - Graceful error handling
*/

const path = require("path");
const express = require("express");
const cors = require("cors");
const { pool } = require("./mysql.cjs");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
// Tiny logger for debugging
app.use((req, _res, next) => {
  console.log(`[api] ${req.method} ${req.url}`);
  next();
});

// Map common MySQL errors to friendly messages
const toDbMessage = (err) => {
  if (!err) return undefined;
  if (err.code === 'ER_ACCESS_DENIED_ERROR') return 'DB access denied: check DB_USER/DB_PASSWORD';
  if (err.code === 'ER_BAD_DB_ERROR') return 'Database not found: check DB_NAME';
  if (err.code === 'ER_NO_SUCH_TABLE') return 'Table not found (users): run the migration/DDL in README';
  if (err.code === 'ECONNREFUSED') return 'Cannot connect to MySQL: check DB_HOST/DB_PORT and that MySQL is running';
  return err.message || String(err);
};

// Simple admin auth using a shared secret. In production, use proper auth (JWT/OAuth).
const requireAdmin = (req, res, next) => {
  const headerSecret = req.headers["x-admin-secret"] || req.headers["x-admin-token"];
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return res.status(500).json({ message: "Server is missing ADMIN_API_SECRET" });
  }
  if (!headerSecret || headerSecret !== secret) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// Health check
app.get("/api/health", async (req, res) => {
  let db = "unknown";
  let db_error = undefined;
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    db = rows?.[0]?.ok === 1 ? "connected" : "unknown";
  } catch (err) {
    console.error("/api/health db error:", err);
    db = "error";
    db_error = err?.message || String(err);
  }
  res.json({ status: "ok", db, db_error });
});

// Admin: create user with role (protected by ADMIN_API_SECRET)
app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!["patient", "doctor", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: "Email is already registered" });
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, role]
    );
    return res.status(201).json({ id: result.insertId, name, email, role });
  } catch (err) {
    console.error("/api/admin/users error:", err);
    return res.status(500).json({ message: "Create user failed", details: toDbMessage(err) });
  }
});

// Example route
app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});

// Registration endpoint
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const userRole = ["patient", "doctor", "admin"].includes(role) ? role : "patient";

    // Check for existing user
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Insert user
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, userRole]
    );

    return res.status(201).json({ id: result.insertId, name, email, role: userRole });
  } catch (err) {
    console.error("/api/register error:", err);
    return res.status(500).json({ message: "Registration failed", details: toDbMessage(err) });
  }
});

// Simple root check
app.get('/api', (_req, res) => {
  res.json({ status: 'ok', message: 'API running', time: new Date().toISOString() });
});

// Example: users list (requires a `users` table). Safe to keep as placeholder.
app.get("/api/users", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, email, role, created_at FROM users ORDER BY id DESC LIMIT 50");
    res.json(rows);
  } catch (err) {
    console.error("/api/users error:", err);
    res.status(500).json({ message: "Database error", details: err.message });
  }
});

// API 404 handler
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

// Global JSON error handler (must be after routes)
// Ensures we never leak HTML error pages to the client
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[api] Unhandled error:", err);
  if (res.headersSent) {
    return; // let Express finish
  }
  res.status(500).json({ message: "Internal Server Error", details: err?.message || "" });
});

// Optional: Serve static files in production after `vite build`
// If you want this server to host the frontend build, uncomment the following:
// const distPath = path.join(__dirname, "..", "dist");
// app.use(express.static(distPath));
// app.get(/^(?!\/api).*/, (req, res) => {
//   res.sendFile(path.join(distPath, "index.html"));
// });

app.listen(PORT, () => {
  console.log(`API server started on http://localhost:${PORT}`);
});
