const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const path    = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../client/public")));

const messageHistory = [];
const activeUsers    = {};

const MAX_HISTORY = 100;

const USER_COLORS = [
  "#f7768e", "#9ece6a", "#e0af68",
  "#7aa2f7", "#bb9af7", "#2ac3de",
];
let colorIndex = 0;

io.on("connection", (socket) => {

  console.log(`🔌 New connection: ${socket.id}`);

  socket.emit("message:history", messageHistory);

  socket.emit("users:list", Object.values(activeUsers));

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

  socket.on("message:send", (data) => {
    const user = activeUsers[socket.id];
    if (!user) return;

    const message = {
      id:     `${socket.id}-${Date.now()}`,
      author: user.username,
      color:  user.color,
      text:   data.text.trim().slice(0, 500),
      ts:     new Date().toISOString(),
    };

    messageHistory.push(message);
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory.shift();
    }

    io.emit("message:receive", message);

    console.log(`💬 [${user.username}]: ${message.text}`);
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
