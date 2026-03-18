const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:AItaTfAkOPnLmWMilHehYIiJTaQspFlH@mainline.proxy.rlwy.net:25345/railway',
  ssl: { rejectUnauthorized: false }
});

const email = 'your@email.cz';
const password = 'nyourPassword';

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