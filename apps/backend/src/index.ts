import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';

import { ensureSchema, pool } from './db';
import { requireAuth, signToken, type TokenPayload } from './auth';

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json());

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(body: unknown): { email: string; password: string } | string {
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'A valid email is required';
  }
  if (typeof password !== 'string' || password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  return { email: email.trim().toLowerCase(), password };
}

app.get('/auth/health', (_req, res) => {
  res.json({ ok: true });
});

// Create an account, then return a JWT so the user is immediately logged in.
app.post('/auth/signup', async (req, res) => {
  const parsed = validateCredentials(req.body);
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed });
    return;
  }
  const { email, password } = parsed;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query<{ id: number; email: string }>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash],
    );
    const user = rows[0];
    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ token, email: user.email });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }
    console.error('[auth] signup failed:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Verify credentials and issue a JWT.
app.post('/auth/login', async (req, res) => {
  const parsed = validateCredentials(req.body);
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed });
    return;
  }
  const { email, password } = parsed;
  try {
    const { rows } = await pool.query<{ id: number; email: string; password_hash: string }>(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, email: user.email });
  } catch (error) {
    console.error('[auth] login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Return the current user from a valid token (used to restore a session).
app.get('/auth/me', requireAuth, (req, res) => {
  const user = (req as express.Request & { user?: TokenPayload }).user;
  res.json({ email: user?.email });
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[backend] auth API listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[backend] failed to initialise database schema:', error);
    process.exit(1);
  });
