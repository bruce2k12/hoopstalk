// ============================================================
// server/reactions.js — Emoji Reactions
// ============================================================
const express  = require('express');
const jwt      = require('jsonwebtoken');
const supabase = require('./supabase');

const router = express.Router();

// ── MIDDLEWARE: verify token ──────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── GET REACTIONS FOR A MESSAGE ───────────────────────────────
router.get('/:messageId', async (req, res) => {
  const { messageId } = req.params;

  try {
    const { data, error } = await supabase
      .from('reactions')
      .select('emoji, user_id')
      .eq('message_id', messageId);

    if (error) throw error;

    // Group reactions by emoji with counts
    // { "🔥": { count: 3, hasReacted: true } }
    const grouped = {};
    data.forEach(r => {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { count: 0, users: [] };
      }
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user_id);
    });

    res.json(grouped);

  } catch (err) {
    console.error('Get reactions error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── TOGGLE REACTION ───────────────────────────────────────────
router.post('/toggle', authMiddleware, async (req, res) => {
  const { message_id, emoji } = req.body;
  const user_id = req.user.id;

  if (!message_id || !emoji) {
    return res.status(400).json({ error: 'message_id and emoji required' });
  }

  try {
    // Check if reaction already exists
    const { data: existing } = await supabase
      .from('reactions')
      .select('id')
      .eq('message_id', message_id)
      .eq('user_id', user_id)
      .eq('emoji', emoji)
      .single();

    if (existing) {
      // Remove reaction (toggle off)
      await supabase
        .from('reactions')
        .delete()
        .eq('message_id', message_id)
        .eq('user_id', user_id)
        .eq('emoji', emoji);

      res.json({ action: 'removed', emoji });

    } else {
      // Add reaction (toggle on)
      await supabase
        .from('reactions')
        .insert({ message_id, user_id, emoji });

      res.json({ action: 'added', emoji });
    }

  } catch (err) {
    console.error('Toggle reaction error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;