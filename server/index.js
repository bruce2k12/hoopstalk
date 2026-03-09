const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const path    = require("path");
require('dotenv').config();
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const supabase = require('./supabase');
const authRoutes = require('./auth');
const reactionRoutes = require('./reactions');
const scoresRoutes = require('./scores');
const picksRoutes = require('./picks');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../client/public")));
// Parse incoming JSON requests
app.use(express.json());

// Auth routes — register, login, verify
app.use('/api/auth', authRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/scores', scoresRoutes);
app.use('/api/picks', picksRoutes);

// Load rooms from database
async function getRooms() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('id');
  if (error) console.error('Error loading rooms:', error);
  return data || [];
}

const activeUsers = {};

const USER_COLORS = [
  "#f7768e", "#9ece6a", "#e0af68",
  "#7aa2f7", "#bb9af7", "#2ac3de",
];
let colorIndex = 0;

io.on("connection", (socket) => {

  console.log(`🔌 New connection: ${socket.id}`);

  // Send current user list
  socket.emit("users:list", Object.values(activeUsers));

  // Send rooms list from database
  getRooms().then(rooms => {
    socket.emit("rooms:list", rooms);
  });

  // Authenticate socket connection with JWT token
  socket.on("auth", async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        id:       decoded.id,
        username: decoded.username,
        color:    decoded.color
      };

      activeUsers[socket.id] = { ...socket.user, socketId: socket.id };

      console.log(`👤 ${socket.user.username} authenticated`);

      io.emit("users:list", Object.values(activeUsers));

      socket.broadcast.emit("message:system", {
        text: `${socket.user.username} joined the chat 🏀`,
        ts:   new Date().toISOString(),
      });

    } catch (err) {
      console.error('Socket auth error:', err);
      socket.emit("auth:error", "Invalid or expired token");
    }
  });

  socket.on("user:join", (username) => {
    const color = USER_COLORS[colorIndex % USER_COLORS.length];
    colorIndex++;

    activeUsers[socket.id] = { username, color, id: socket.id };

    console.log(`👤 ${username} joined`);

    io.emit("users:list", Object.values(activeUsers));

    socket.broadcast.emit("message:system", {
      text: `${username} joined the chat 🏀`,
      ts: new Date().toISOString(),
    });
  });

  socket.on("message:send", async (data) => {
    const user = socket.user;
    if (!user) return;

    const text    = data.text.trim().slice(0, 500);
    const room_id = data.room_id || 1;

    try {
      // Save message to Supabase
      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          room_id,
          text,
        })
        .select(`
          id,
          text,
          created_at,
          room_id,
          users ( id, username, color )
        `)
        .single();

      if (error) throw error;

      // Format for the client
      const formatted = {
        id:       message.id,
        author:   message.users.username,
        color:    message.users.color,
        text:     message.text,
        room_id:  message.room_id,
        ts:       message.created_at,
      };

      // Broadcast to everyone in that room
      io.emit("message:receive", formatted);

      console.log(`💬 [${user.username}] #${room_id}: ${text}`);

    } catch (err) {
      console.error('Message error:', err);
    }
  });

  // Load message history for a specific room
  socket.on("room:join", async (room_id) => {
    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          id,
          text,
          created_at,
          room_id,
          users ( id, username, color )
        `)
        .eq('room_id', room_id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      const formatted = messages.map(m => ({
        id:      m.id,
        author:  m.users.username,
        color:   m.users.color,
        text:    m.text,
        room_id: m.room_id,
        ts:      m.created_at,
      }));

      socket.emit("message:history", formatted);

    } catch (err) {
      console.error('Room join error:', err);
    }
  });

   socket.on("typing:start", () => {
    const user = activeUsers[socket.id];
    if (!user) return;
    socket.broadcast.emit("typing:update", { username: user.username, isTyping: true });
  });

  socket.on("typing:stop", () => {
    const user = activeUsers[socket.id];
    if (!user) return;
    socket.broadcast.emit("typing:update", { username: user.username, isTyping: false });
  });

  // Broadcast reaction updates to everyone
  socket.on("reaction:update", (data) => {
    socket.broadcast.emit("reaction:update", data);
  });

  socket.on("disconnect", () => {
    const user = activeUsers[socket.id];
    if (user) {
      console.log(`👋 ${user.username} left`);
      delete activeUsers[socket.id];

      io.emit("users:list", Object.values(activeUsers));

      io.emit("message:system", {
        text: `${user.username} left the chat`,
        ts:   new Date().toISOString(),
      });
    }
  });

});

server.listen(PORT, () => {
  console.log(`\n🏀 HoopsTalk server running!`);
  console.log(`   Local:   http://localhost:${PORT}\n`);
});
