const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { redis } = require('../services/redis');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard/overview — headline stat cards
router.get('/overview', async (req, res) => {
  const { organizationId } = req.user;
  try {
    const cacheKey = `dashboard:overview:${organizationId}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return res.json(JSON.parse(cached));

    const [org, deviceCount, incidentCount] = await Promise.all([
      pool.query('SELECT security_score, risk_level FROM organizations WHERE id = $1', [organizationId]),
      pool.query('SELECT COUNT(*)::int AS count FROM devices WHERE organization_id = $1 AND protected = true', [organizationId]),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM incidents
         WHERE organization_id = $1 AND status IN ('OPEN','IN_REVIEW')`,
        [organizationId]
      ),
    ]);

    const payload = {
      securityScore: org.rows[0]?.security_score ?? 0,
      riskLevel: org.rows[0]?.risk_level ?? 'Unknown',
      protectedDevices: deviceCount.rows[0].count,
      activeIncidents: incidentCount.rows[0].count,
    };

    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 15).catch(() => {});
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

// GET /api/dashboard/alerts?limit=10
router.get('/alerts', async (req, res) => {
  const { organizationId } = req.user;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  try {
    const result = await pool.query(
      `SELECT id, title, severity, source, created_at
       FROM alerts WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [organizationId, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

// GET /api/dashboard/timeline — attacks detected vs blocked, hourly buckets over last 24h
router.get('/timeline', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        date_trunc('hour', created_at) AS bucket,
        COUNT(*)::int AS detected,
        COUNT(*) FILTER (WHERE blocked)::int AS blocked
      FROM threat_events
      WHERE created_at > now() - interval '24 hours'
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
});

// GET /api/dashboard/threat-map — recent geolocated events for the live map
router.get('/threat-map', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT lat, lng, country, blocked, created_at
      FROM threat_events
      ORDER BY created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load threat map data' });
  }
});

// GET /api/dashboard/cloud-assets — coverage by provider
router.get('/cloud-assets', async (req, res) => {
  const { organizationId } = req.user;
  try {
    const result = await pool.query(
      'SELECT provider, coverage_pct, resource_count FROM cloud_assets WHERE organization_id = $1',
      [organizationId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load cloud assets' });
  }
});

// GET /api/dashboard/incidents
router.get('/incidents', async (req, res) => {
  const { organizationId } = req.user;
  try {
    const result = await pool.query(
      `SELECT id, title, description, severity, status, created_at, resolved_at
       FROM incidents WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [organizationId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load incidents' });
  }
});

// PATCH /api/dashboard/incidents/:id — update status (contain/resolve)
router.patch('/incidents/:id', async (req, res) => {
  const { organizationId } = req.user;
  const { status } = req.body;
  const allowed = ['OPEN', 'IN_REVIEW', 'CONTAINED', 'RESOLVED'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  }
  try {
    const result = await pool.query(
      `UPDATE incidents SET status = $1, resolved_at = CASE WHEN $1 = 'RESOLVED' THEN now() ELSE resolved_at END
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [status, req.params.id, organizationId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

module.exports = router;
