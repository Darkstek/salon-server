const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'salon_booking',
  password: 'postgres123',
  port: 5432,
});

const email = 'mama@salon.cz';
const password = 'heslo123';

const hash = bcrypt.hashSync(password, 10);

pool.query(
  'INSERT INTO users (email, password) VALUES ($1, $2)',
  [email, hash]
).then(() => {
  console.log('Uživatel vytvořen!');
  process.exit();
}).catch(err => {
  console.error(err);
  process.exit();
});
