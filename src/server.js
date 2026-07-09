require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { pool } = require('./db/pool');
const { connectRedis } = require('./services/redis');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const copilotRoutes = require('./routes/copilot');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Basic rate limiting on all API routes; tighter on auth to slow brute force.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unreachable', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/copilot', copilotRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`Secunova API listening on http://localhost:${PORT}`);
  });
}

start();

module.exports = app;
