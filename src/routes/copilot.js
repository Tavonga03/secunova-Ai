const express = require('express');
const { z } = require('zod');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { askCopilot } = require('../services/copilot');

const router = express.Router();
router.use(requireAuth);

// POST /api/copilot/sessions — start a new chat session
router.post('/sessions', async (req, res) => {
  const { userId, organizationId } = req.user;
  try {
    const result = await pool.query(
      'INSERT INTO chat_sessions (user_id, organization_id) VALUES ($1, $2) RETURNING *',
      [userId, organizationId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
});

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
});

// POST /api/copilot/sessions/:id/messages — send a message, get the AI reply
router.post('/sessions/:id/messages', async (req, res) => {
  const { organizationId } = req.user;
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'message is required' });
  }
  const { message } = parsed.data;
  const sessionId = req.params.id;

  const client = await pool.connect();
  try {
    const session = await client.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND organization_id = $2',
      [sessionId, organizationId]
    );
    if (session.rowCount === 0) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    await client.query(
      `INSERT INTO chat_messages (chat_session_id, role, content) VALUES ($1, 'user', $2)`,
      [sessionId, message]
    );

    // Pull a little live context (recent alerts) so the copilot can ground its answer
    const recentAlerts = await client.query(
      `SELECT title, severity, source FROM alerts
       WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [organizationId]
    );

    const { answer, source } = await askCopilot({
      question: message,
      context: { recentAlerts: recentAlerts.rows },
    });

    await client.query(
      `INSERT INTO chat_messages (chat_session_id, role, content) VALUES ($1, 'assistant', $2)`,
      [sessionId, answer]
    );

    res.json({ answer, source });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process message' });
  } finally {
    client.release();
  }
});

// GET /api/copilot/sessions/:id/messages — full history for a session
router.get('/sessions/:id/messages', async (req, res) => {
  const { organizationId } = req.user;
  try {
    const session = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND organization_id = $2',
      [req.params.id, organizationId]
    );
    if (session.rowCount === 0) return res.status(404).json({ error: 'Chat session not found' });

    const messages = await pool.query(
      'SELECT role, content, created_at FROM chat_messages WHERE chat_session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(messages.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

module.exports = router;
