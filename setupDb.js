const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:AItaTfAkOPnLmWMilHehYIiJTaQspFlH@mainline.proxy.rlwy.net:25345/railway',
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id),
      service_name VARCHAR(100) NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Tabulky vytvořeny!');

  await pool.query(`
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
  `);
  console.log('Sloupce user_id přidány!');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id),
      business_name VARCHAR(100),
      phone VARCHAR(20),
      address TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Tabulka profiles vytvořena!');

  // 👇 NOVÉ: tabulka pro služby podnikatele
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      name VARCHAR(100) NOT NULL,
      price INTEGER,
      duration INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Tabulka services vytvořena!');
  // 👆 konec nového bloku

  process.exit();
}

setup().catch(err => {
  console.error(err);
  process.exit();
});