const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client('783420070926-3fijlp9s34nlo0q8joh04ughnn707ml2.apps.googleusercontent.com');

const JWT_SECRET = 'salon_tajny_klic_2026';


const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:AItaTfAkOPnLmWMilHehYIiJTaQspFlH@mainline.proxy.rlwy.net:25345/railway',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Middleware pro ověření tokenu
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Nepřihlášen' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Neplatný token' });
  }
};

// Test endpoint
app.get('/api/test', async (req, res) => {
  const result = await pool.query('SELECT NOW()');
  res.json({ message: 'Databáze funguje!', time: result.rows[0].now });
});

// Získat všechny zákazníky
app.get('/api/customers', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM customers WHERE user_id = $1 ORDER BY created_at DESC',
    [req.userId]
  );
  res.json(result.rows);
});

// Přidat zákazníka
app.post('/api/customers', authenticate, async (req, res) => {
  const { name, phone, note } = req.body;
  const result = await pool.query(
    'INSERT INTO customers (name, phone, note, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, phone, note, req.userId]
  );
  res.json(result.rows[0]);
});

// Přidat termín
app.post('/api/appointments', authenticate, async (req, res) => {
  const { customer_id, service_name, appointment_date, appointment_time, note } = req.body;
  const result = await pool.query(
    'INSERT INTO appointments (customer_id, service_name, appointment_date, appointment_time, note, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [customer_id, service_name, appointment_date, appointment_time, note, req.userId]
  );
  res.json(result.rows[0]);
});

// Získat všechny termíny
app.get('/api/appointments', authenticate, async (req, res) => {
  const result = await pool.query(`
    SELECT a.*, c.name as customer_name 
    FROM appointments a
    JOIN customers c ON a.customer_id = c.id
    WHERE a.user_id = $1
    ORDER BY appointment_date, appointment_time
  `, [req.userId]);
  res.json(result.rows);
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  
  if (!user) return res.status(401).json({ error: 'Nesprávný email nebo heslo' });
  
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Nesprávný email nebo heslo' });
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// Smazat termín
app.delete('/api/appointments/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM appointments WHERE id = $1 AND user_id = $2', [id, req.userId]);
  res.json({ success: true });
});

// Smazat zákazníka
app.delete('/api/customers/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM appointments WHERE customer_id = $1 AND user_id = $2', [id, req.userId]);
  await pool.query('DELETE FROM customers WHERE id = $1 AND user_id = $2', [id, req.userId]);
  res.json({ success: true });
});

// Detail zákazníka
app.get('/api/customers/:id/detail', authenticate, async (req, res) => {
  const { id } = req.params;
  
  const history = await pool.query(`
    SELECT * FROM appointments 
    WHERE customer_id = $1 AND user_id = $2
    AND appointment_date < CURRENT_DATE
    ORDER BY appointment_date DESC 
    LIMIT 5
  `, [id, req.userId]);

  const upcoming = await pool.query(`
    SELECT * FROM appointments 
    WHERE customer_id = $1 AND user_id = $2
    AND appointment_date >= CURRENT_DATE
    ORDER BY appointment_date ASC 
    LIMIT 5
  `, [id, req.userId]);

  res.json({
    history: history.rows,
    upcoming: upcoming.rows
  });
});

// Google login
app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: '783420070926-3fijlp9s34nlo0q8joh04ughnn707ml2.apps.googleusercontent.com',
  });

  const payload = ticket.getPayload();
  const email = payload.email;

  let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

  if (user.rows.length === 0) {
    user = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *',
      [email, 'google-oauth']
    );
  }

  const jwtToken = jwt.sign({ userId: user.rows[0].id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token: jwtToken });
});

app.listen(5000, () => {
  console.log('Server běží na portu 5000');
});