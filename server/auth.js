// ============================================================
// server/auth.js — Register & Login
// ============================================================
// This file handles:
//   1. POST /api/register — create a new account
//   2. POST /api/login    — sign in with username + PIN
// ============================================================

require('dotenv').config();
const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const supabase = require('./supabase');

const router = express.Router();
const SALT_ROUNDS = 10;
const JWT_SECRET  = process.env.JWT_SECRET;

// ── REGISTER ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, pin } = req.body;

  if (!username || !pin) {
    return res.status(400).json({ error: 'Username and PIN are required' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }
  if (pin.length !== 4) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }
  if (!/^\d+$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be numbers only' });
  }

  try {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const pin_hash = await bcrypt.hash(pin, SALT_ROUNDS);

    const colors = ['#f7768e','#9ece6a','#e0af68','#7aa2f7','#bb9af7','#2ac3de'];
    const color  = colors[Math.floor(Math.random() * colors.length)];

    const { data: user, error } = await supabase
      .from('users')
      .insert({ username, pin_hash, color })
      .select()
      .single();

    if (error) throw error;

    const token = jwt.sign(
      { id: user.id, username: user.username, color: user.color },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, color: user.color } });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, pin } = req.body;

  if (!username || !pin) {
    return res.status(400).json({ error: 'Username and PIN are required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'Username not found' });
    }

    const pinMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!pinMatch) {
      return res.status(400).json({ error: 'Incorrect PIN' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, color: user.color },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, color: user.color } });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── VERIFY TOKEN ──────────────────────────────────────────────
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: { id: decoded.id, username: decoded.username, color: decoded.color } });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;