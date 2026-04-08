require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Middleware pro ověření tokenu
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Nepřihlášen" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Neplatný token" });
  }
};

// Test endpoint
app.get("/api/test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json({ message: "Databáze funguje!", time: result.rows[0].now });
});

// Získat všechny zákazníky
app.get("/api/customers", authenticate, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM customers WHERE user_id = $1 ORDER BY created_at DESC",
    [req.userId],
  );
  res.json(result.rows);
});

// Přidat zákazníka
app.post("/api/customers", authenticate, async (req, res) => {
  const { name, phone, note } = req.body;
  const result = await pool.query(
    "INSERT INTO customers (name, phone, note, user_id) VALUES ($1, $2, $3, $4) RETURNING *",
    [name, phone, note, req.userId],
  );
  res.json(result.rows[0]);
});

// Přidat termín
app.post("/api/appointments", authenticate, async (req, res) => {
  const {
    customer_id,
    customer_name_unregistered,
    service_name,
    appointment_date,
    appointment_time,
    note,
  } = req.body;
  const result = await pool.query(
    "INSERT INTO appointments (customer_id, customer_name_unregistered, service_name, appointment_date, appointment_time, note, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    [
      customer_id || null,
      customer_name_unregistered || null,
      service_name,
      appointment_date,
      appointment_time,
      note,
      req.userId,
    ],
  );
  res.json(result.rows[0]);
});

// Získat všechny termíny
app.get("/api/appointments", authenticate, async (req, res) => {
  const result = await pool.query(
    `
    SELECT a.*, COALESCE(c.name, a.customer_name_unregistered) as customer_name 
    FROM appointments a
    LEFT JOIN customers c ON a.customer_id = c.id
    WHERE a.user_id = $1
    ORDER BY appointment_date, appointment_time
  `,
    [req.userId],
  );
  res.json(result.rows);
});

// Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  const user = result.rows[0];

  if (!user)
    return res.status(401).json({ error: "Nesprávný email nebo heslo" });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid)
    return res.status(401).json({ error: "Nesprávný email nebo heslo" });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

// Smazat termín
app.delete("/api/appointments/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM appointments WHERE id = $1 AND user_id = $2", [
    id,
    req.userId,
  ]);
  res.json({ success: true });
});

// Smazat zákazníka
app.delete("/api/customers/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  await pool.query(
    "DELETE FROM appointments WHERE customer_id = $1 AND user_id = $2",
    [id, req.userId],
  );
  await pool.query("DELETE FROM customers WHERE id = $1 AND user_id = $2", [
    id,
    req.userId,
  ]);
  res.json({ success: true });
});

// Detail zákazníka
app.get("/api/customers/:id/detail", authenticate, async (req, res) => {
  const { id } = req.params;

  const history = await pool.query(
    `
    SELECT * FROM appointments 
    WHERE customer_id = $1 AND user_id = $2
    AND appointment_date < CURRENT_DATE
    ORDER BY appointment_date DESC 
    LIMIT 5
  `,
    [id, req.userId],
  );

  const upcoming = await pool.query(
    `
    SELECT * FROM appointments 
    WHERE customer_id = $1 AND user_id = $2
    AND appointment_date >= CURRENT_DATE
    ORDER BY appointment_date ASC 
    LIMIT 5
  `,
    [id, req.userId],
  );

  res.json({
    history: history.rows,
    upcoming: upcoming.rows,
  });
});

// Google login
app.post("/api/auth/google", async (req, res) => {
  const { token } = req.body;

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const email = payload.email;

  let user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

  if (user.rows.length === 0) {
    user = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
      [email, "google-oauth"],
    );
  }

  const jwtToken = jwt.sign({ userId: user.rows[0].id }, JWT_SECRET, {
    expiresIn: "7d",
  });
  res.json({ token: jwtToken });
});

// Získat profil
app.get("/api/profile", authenticate, async (req, res) => {
  const result = await pool.query("SELECT * FROM profiles WHERE user_id = $1", [
    req.userId,
  ]);
  res.json(result.rows[0] || null);
});

// Uložit/upravit profil
app.post("/api/profile", authenticate, async (req, res) => {
  const { business_name, phone, address, description } = req.body;

  const result = await pool.query(
    `
    INSERT INTO profiles (user_id, business_name, phone, address, description)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id) 
    DO UPDATE SET business_name = $2, phone = $3, address = $4, description = $5
    RETURNING *
  `,
    [req.userId, business_name, phone, address, description],
  );

  res.json(result.rows[0]);
});

// Veřejný seznam všech profilů
app.get("/api/profiles/public", async (req, res) => {
  const result = await pool.query(
    "SELECT id, user_id, business_name, phone, address, description FROM profiles WHERE business_name IS NOT NULL ORDER BY business_name",
  );
  res.json(result.rows);
});

// Získat služby podnikatele (veřejné - bez autentizace)
app.get("/api/services/:userId", async (req, res) => {
  const { userId } = req.params;
  const result = await pool.query(
    "SELECT * FROM services WHERE user_id = $1 ORDER BY created_at ASC",
    [userId],
  );
  res.json(result.rows);
});

// Přidat službu (pouze přihlášený podnikatel)
app.post("/api/services", authenticate, async (req, res) => {
  const { name, price, duration } = req.body;
  const result = await pool.query(
    "INSERT INTO services (user_id, name, price, duration) VALUES ($1, $2, $3, $4) RETURNING *",
    [req.userId, name, price, duration],
  );
  res.json(result.rows[0]);
});

// Smazat službu (pouze přihlášený podnikatel)
app.delete("/api/services/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM services WHERE id = $1 AND user_id = $2", [
    id,
    req.userId,
  ]);
  res.json({ success: true });
});

// Uložit dostupnost podnikatele
app.post("/api/availability", authenticate, async (req, res) => {
  const { availability, slot_duration } = req.body;

  await pool.query("DELETE FROM availability WHERE user_id = $1", [req.userId]);

  for (const day of availability) {
    await pool.query(
      "INSERT INTO availability (user_id, day_of_week, start_time, end_time, slot_duration) VALUES ($1, $2, $3, $4, $5)",
      [
        req.userId,
        day.day_of_week,
        day.start_time,
        day.end_time,
        slot_duration,
      ],
    );
  }

  await pool.query(
    "UPDATE profiles SET slot_duration = $1 WHERE user_id = $2",
    [slot_duration, req.userId],
  );

  res.json({ success: true });
});

// Získat dostupnost podnikatele
app.get("/api/availability", authenticate, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM availability WHERE user_id = $1 ORDER BY day_of_week",
    [req.userId],
  );
  res.json(result.rows);
});

// Získat volné sloty pro daný den (veřejné)
app.get("/api/slots/:userId/:date", async (req, res) => {
  const { userId, date } = req.params;

  const dayOfWeek = new Date(date).getDay();

  const availResult = await pool.query(
    "SELECT * FROM availability WHERE user_id = $1 AND day_of_week = $2",
    [userId, dayOfWeek],
  );

  if (availResult.rows.length === 0) {
    return res.json({ slots: [] });
  }

  const avail = availResult.rows[0];
  const slotDuration = avail.slot_duration;

  const bookedResult = await pool.query(
    "SELECT appointment_time FROM appointments WHERE user_id = $1 AND appointment_date = $2",
    [userId, date],
  );
  const bookedTimes = bookedResult.rows.map((r) =>
    r.appointment_time.slice(0, 5),
  );

  const slots = [];
  let current = avail.start_time.slice(0, 5);
  const end = avail.end_time.slice(0, 5);

  while (current < end) {
    if (!bookedTimes.includes(current)) {
      slots.push(current);
    }
    const [h, m] = current.split(":").map(Number);
    const total = h * 60 + m + slotDuration;
    const newH = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const newM = (total % 60).toString().padStart(2, "0");
    current = `${newH}:${newM}`;
  }

  res.json({ slots });
});

// Veřejná rezervace od zákazníka
app.post("/api/bookings", async (req, res) => {
  const {
    user_id,
    service_name,
    appointment_date,
    appointment_time,
    customer_name,
    customer_phone,
  } = req.body;

  const result = await pool.query(
    "INSERT INTO appointments (customer_name_unregistered, service_name, appointment_date, appointment_time, note, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [
      customer_name,
      service_name,
      appointment_date,
      appointment_time,
      customer_phone || null,
      user_id,
    ],
  );

  res.json({ success: true, appointment: result.rows[0] });
});

app.listen(5000, () => {
  console.log("Server běží na portu 5000");
});
