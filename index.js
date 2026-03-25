const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = 'salon_tajny_klic_2026';


const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:AItaTfAkOPnLmWMilHehYIiJTaQspFlH@mainline.proxy.rlwy.net:25345/railway',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  const result = await pool.query('SELECT NOW()');
  res.json({ message: 'Databáze funguje!', time: result.rows[0].now });
});

// Získat všechny zákazníky
app.get('/api/customers', async (req, res) => {
  const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
  res.json(result.rows);
});

// Přidat zákazníka
app.post('/api/customers', async (req, res) => {
  const { name, phone, note } = req.body;
  const result = await pool.query(
    'INSERT INTO customers (name, phone, note) VALUES ($1, $2, $3) RETURNING *',
    [name, phone, note]
  );
  res.json(result.rows[0]);
});

// Přidat termín
app.post('/api/appointments', async (req, res) => {
  const { customer_id, service_name, appointment_date, appointment_time, note } = req.body;
  const result = await pool.query(
    'INSERT INTO appointments (customer_id, service_name, appointment_date, appointment_time, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [customer_id, service_name, appointment_date, appointment_time, note]
  );
  res.json(result.rows[0]);
});

// Získat všechny termíny
app.get('/api/appointments', async (req, res) => {
  const result = await pool.query(`
    SELECT a.*, c.name as customer_name 
    FROM appointments a
    JOIN customers c ON a.customer_id = c.id
    ORDER BY appointment_date, appointment_time
  `);
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
app.delete('/api/appointments/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM appointments WHERE id = $1', [id]);
  res.json({ success: true });
});

// Smazat zákazníka
app.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM customers WHERE id = $1', [id]);
  res.json({ success: true });
});

// Detail zákazníka - historie a aktivní schůzka
app.get('/api/customers/:id/detail', async (req, res) => {
  const { id } = req.params;
  
  const history = await pool.query(`
    SELECT * FROM appointments 
    WHERE customer_id = $1 
    AND appointment_date < CURRENT_DATE
    ORDER BY appointment_date DESC 
    LIMIT 3
  `, [id]);

  const upcoming = await pool.query(`
    SELECT * FROM appointments 
    WHERE customer_id = $1 
    AND appointment_date >= CURRENT_DATE
    ORDER BY appointment_date ASC 
    LIMIT 1
  `, [id]);

  res.json({
    history: history.rows,
    upcoming: upcoming.rows[0] || null
  });
});

app.listen(5000, () => {
  console.log('Server běží na portu 5000');
});