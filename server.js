const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const isLocalDB =
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes('localhost') ||
  process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDB ? false : { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('DB ready');
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/count', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM waitlist');
    res.json({ count: rows[0].n });
  } catch (err) {
    console.error(err);
    res.status(500).json({ count: 0 });
  }
});

app.get('/admin', async (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, email, source, created_at FROM waitlist ORDER BY created_at DESC'
    );
    const rows_html = rows.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.email}</td>
        <td>${r.source}</td>
        <td>${new Date(r.created_at).toLocaleString()}</td>
      </tr>`).join('');

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>PodAssist — Waitlist</title>
  <style>
    body { font-family: monospace; background: #0f0d08; color: #f5e6c8; padding: 2rem; }
    h1 { color: #d97706; margin-bottom: 1.5rem; }
    p  { color: #a08c5a; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 0.6rem 1rem; background: #201a0a; color: #d97706; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
    td { padding: 0.6rem 1rem; border-bottom: 1px solid rgba(255,220,100,0.08); font-size: 0.875rem; }
    tr:hover td { background: rgba(217,119,6,0.05); }
  </style>
</head>
<body>
  <h1>PodAssist Waitlist</h1>
  <p>${rows.length} signup${rows.length !== 1 ? 's' : ''} total</p>
  <table>
    <thead><tr><th>#</th><th>Email</th><th>Source</th><th>Signed up</th></tr></thead>
    <tbody>${rows_html || '<tr><td colspan="4" style="color:#a08c5a">No signups yet.</td></tr>'}</tbody>
  </table>
</body>
</html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/waitlist', async (req, res) => {
  const { email, source } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  try {
    await pool.query(
      'INSERT INTO waitlist (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
      [email.toLowerCase().trim(), source || 'unknown']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`PodAssist running on port ${PORT}`));
});
