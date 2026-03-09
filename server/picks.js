// ============================================================
// server/picks.js — Predictions / Picks feature
// ============================================================
require('dotenv').config();
const express = require('express');
const jwt     = require('jsonwebtoken');
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

// ── GET ALL PICKS ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('picks')
      .select(`
        id,
        game_id,
        game_description,
        picked_team,
        result,
        created_at,
        users ( id, username, color )
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Get votes for each pick
    const picksWithVotes = await Promise.all(data.map(async (pick) => {
      const { data: votes } = await supabase
        .from('pick_votes')
        .select('vote, user_id')
        .eq('pick_id', pick.id);

      const agrees    = votes?.filter(v => v.vote === 'agree').length || 0;
      const disagrees = votes?.filter(v => v.vote === 'disagree').length || 0;

      return {
        id:               pick.id,
        game_id:          pick.game_id,
        game_description: pick.game_description,
        picked_team:      pick.picked_team,
        result:           pick.result,
        created_at:       pick.created_at,
        author:           pick.users.username,
        author_id:        pick.users.id,
        color:            pick.users.color,
        votes:            { agrees, disagrees, all: votes || [] },
      };
    }));

    res.json({ picks: picksWithVotes });

  } catch (err) {
    console.error('Get picks error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── CREATE A PICK ─────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const { game_id, game_description, picked_team } = req.body;
  const user_id = req.user.id;

  if (!game_id || !game_description || !picked_team) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const { data, error } = await supabase
      .from('picks')
      .insert({ user_id, game_id, game_description, picked_team })
      .select(`
        id,
        game_id,
        game_description,
        picked_team,
        result,
        created_at,
        users ( id, username, color )
      `)
      .single();

    if (error) throw error;

    res.json({
      id:               data.id,
      game_id:          data.game_id,
      game_description: data.game_description,
      picked_team:      data.picked_team,
      result:           data.result,
      created_at:       data.created_at,
      author:           data.users.username,
      author_id:        data.users.id,
      color:            data.users.color,
      votes:            { agrees: 0, disagrees: 0, all: [] },
    });

  } catch (err) {
    console.error('Create pick error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── VOTE ON A PICK ────────────────────────────────────────────
router.post('/:pickId/vote', authMiddleware, async (req, res) => {
  const { pickId } = req.params;
  const { vote }   = req.body;
  const user_id    = req.user.id;

  if (!['agree', 'disagree'].includes(vote)) {
    return res.status(400).json({ error: 'Vote must be agree or disagree' });
  }

  try {
    // Check if already voted
    const { data: existing } = await supabase
      .from('pick_votes')
      .select('id, vote')
      .eq('pick_id', pickId)
      .eq('user_id', user_id)
      .single();

    if (existing) {
      if (existing.vote === vote) {
        // Same vote — remove it (toggle off)
        await supabase
          .from('pick_votes')
          .delete()
          .eq('pick_id', pickId)
          .eq('user_id', user_id);

        return res.json({ action: 'removed', vote });
      } else {
        // Different vote — update it
        await supabase
          .from('pick_votes')
          .update({ vote })
          .eq('pick_id', pickId)
          .eq('user_id', user_id);

        return res.json({ action: 'updated', vote });
      }
    }

    // New vote
    await supabase
      .from('pick_votes')
      .insert({ pick_id: pickId, user_id, vote });

    res.json({ action: 'added', vote });

  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── MARK RESULT (pick creator only) ──────────────────────────
router.post('/:pickId/result', authMiddleware, async (req, res) => {
  const { pickId } = req.params;
  const { result } = req.body;
  const user_id    = req.user.id;

  if (!['won', 'lost'].includes(result)) {
    return res.status(400).json({ error: 'Result must be won or lost' });
  }

  try {
    // Only the pick creator can mark result
    const { data: pick } = await supabase
      .from('picks')
      .select('user_id')
      .eq('id', pickId)
      .single();

    if (!pick) return res.status(404).json({ error: 'Pick not found' });
    if (pick.user_id !== user_id) {
      return res.status(403).json({ error: 'Only the pick creator can mark results' });
    }

    await supabase
      .from('picks')
      .update({ result })
      .eq('id', pickId);

    res.json({ success: true, result });

  } catch (err) {
    console.error('Result error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── GET LEADERBOARD ───────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('picks')
      .select(`
        result,
        users ( id, username, color )
      `)
      .neq('result', 'pending');

    if (error) throw error;

    // Calculate win/loss per user
    const stats = {};
    data.forEach(pick => {
      const uid = pick.users.id;
      if (!stats[uid]) {
        stats[uid] = {
          username: pick.users.username,
          color:    pick.users.color,
          wins:     0,
          losses:   0,
        };
      }
      if (pick.result === 'won') stats[uid].wins++;
      if (pick.result === 'lost') stats[uid].losses++;
    });

    // Sort by wins
    const leaderboard = Object.values(stats)
      .sort((a, b) => b.wins - a.wins)
      .map((user, index) => ({
        rank:     index + 1,
        ...user,
        total:    user.wins + user.losses,
        winRate:  user.wins + user.losses > 0
          ? Math.round((user.wins / (user.wins + user.losses)) * 100)
          : 0,
      }));

    res.json({ leaderboard });

  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;