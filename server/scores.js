// ============================================================
// server/scores.js — NBA Scores & Stats
// ============================================================
require('dotenv').config();
const express = require('express');
const router  = express.Router();

const API_KEY  = process.env.BALLDONTLIE_API_KEY;
const BASE_URL = 'https://api.balldontlie.io/v1';

const HEADERS = {
  'Authorization': `${API_KEY}`,
  'Content-Type': 'application/json'
};

// ── HELPER: fetch from balldontlie ────────────────────────────
async function bdlFetch(endpoint) {
  console.log('🏀 Fetching:', `${BASE_URL}${endpoint}`);
  console.log('🔑 API Key:', API_KEY ? 'Found' : 'MISSING');
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: HEADERS });
  console.log('📡 Response status:', res.status);
  if (!res.ok) throw new Error(`BDL API error: ${res.status}`);
  return res.json();
}

// ── HELPER: get today's date in YYYY-MM-DD ────────────────────
function today() {
  return new Date().toISOString().split('T')[0];
}

// ── GET TODAY'S GAMES ─────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    const data = await bdlFetch(`/games?dates[]=${today()}&per_page=15`);

    const games = data.data.map(game => ({
      id:         game.id,
      status:     game.status,
      period:     game.period,
      time:       game.time,
      home_team:  {
        name:  game.home_team.full_name,
        abbr:  game.home_team.abbreviation,
        score: game.home_team_score,
      },
      away_team: {
        name:  game.visitor_team.full_name,
        abbr:  game.visitor_team.abbreviation,
        score: game.visitor_team_score,
      },
    }));

    res.json({ games });

  } catch (err) {
    console.error('Scores error:', err);
    res.status(500).json({ error: 'Could not fetch scores' });
  }
});

// ── GET STAT LEADERS FOR TODAY ────────────────────────────────
router.get('/leaders', async (req, res) => {
  res.json({ points: null, assists: null, rebounds: null });
});

module.exports = router;