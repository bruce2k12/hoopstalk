// ============================================================
// client/public/js/app.js — HoopsTalk Phase 2
// ============================================================

// ── STATE ────────────────────────────────────────────────────
let socket       = null;
let currentUser  = null;
let currentRoom  = null;
let typingTimer  = null;
let isTyping     = false;
let lastAuthor   = "";

// ── DOM REFERENCES ───────────────────────────────────────────
const authScreen    = document.getElementById("auth-screen");
const chatScreen    = document.getElementById("chat-screen");
const messagesEl    = document.getElementById("messages");
const userListEl    = document.getElementById("user-list");
const roomListEl    = document.getElementById("room-list");
const userCountEl   = document.getElementById("user-count");
const typingBar     = document.getElementById("typing-bar");
const connDot       = document.getElementById("conn-dot");
const connLabel     = document.getElementById("conn-label");
const msgInput      = document.getElementById("msg-input");
const sendBtn       = document.getElementById("send-btn");
const usersToggle   = document.getElementById("users-toggle");
const gamesContainer = document.getElementById("games-container");
const leaderPts      = document.getElementById("leader-pts");
const leaderAst      = document.getElementById("leader-ast");
const leaderReb      = document.getElementById("leader-reb");
const sidebar       = document.getElementById("sidebar");
const loggedInUser  = document.getElementById("logged-in-user");
const currentRoomTag = document.getElementById("current-room-tag");

// ── TAB SWITCHING ─────────────────────────────────────────────
function switchTab(tab) {
  const loginForm    = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab     = document.getElementById("login-tab");
  const registerTab  = document.getElementById("register-tab");

  if (tab === "login") {
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
  } else {
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    loginTab.classList.remove("active");
    registerTab.classList.add("active");
  }
}

// ── AUTH: REGISTER ────────────────────────────────────────────
async function handleRegister() {
  const username   = document.getElementById("reg-username").value.trim();
  const pin        = document.getElementById("reg-pin").value.trim();
  const pinConfirm = document.getElementById("reg-pin-confirm").value.trim();
  const errorEl    = document.getElementById("register-error");

  errorEl.textContent = "";

  if (pin !== pinConfirm) {
    errorEl.textContent = "PINs do not match";
    return;
  }

  try {
    const res  = await fetch("/api/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, pin }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error;
      return;
    }

    // Save token and connect
    localStorage.setItem("hoopstalk_token", data.token);
    currentUser = data.user;
    enterChat();

  } catch (err) {
    errorEl.textContent = "Something went wrong, try again";
  }
}

// ── AUTH: LOGIN ───────────────────────────────────────────────
async function handleLogin() {
  const username = document.getElementById("login-username").value.trim();
  const pin      = document.getElementById("login-pin").value.trim();
  const errorEl  = document.getElementById("login-error");

  errorEl.textContent = "";

  try {
    const res  = await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, pin }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error;
      return;
    }

    localStorage.setItem("hoopstalk_token", data.token);
    currentUser = data.user;
    enterChat();

  } catch (err) {
    errorEl.textContent = "Something went wrong, try again";
  }
}

// ── AUTH: LOGOUT ──────────────────────────────────────────────
function handleLogout() {
  localStorage.removeItem("hoopstalk_token");
  currentUser = null;
  currentRoom = null;
  if (socket) socket.disconnect();
  authScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}

// ── ENTER CHAT ────────────────────────────────────────────────
function enterChat() {
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  loggedInUser.textContent = currentUser.username;
  connectSocket();
  startScoreUpdates();
}

// ── SOCKET CONNECTION ─────────────────────────────────────────
function connectSocket() {
  socket = io();

  socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
    setConnectionStatus(true);

    // Authenticate socket with JWT token
    const token = localStorage.getItem("hoopstalk_token");
    socket.emit("auth", token);

    msgInput.disabled = false;
    sendBtn.disabled  = false;
    msgInput.focus();
  });

  socket.on("disconnect", () => {
    setConnectionStatus(false);
    msgInput.disabled = true;
    sendBtn.disabled  = true;
  });

  socket.on("auth:error", (msg) => {
    console.error("Auth error:", msg);
    handleLogout();
  });

  // Rooms list from server
  socket.on("rooms:list", (rooms) => {
    renderRoomList(rooms);
    // Auto join first room
    if (rooms.length > 0 && !currentRoom) {
      joinRoom(rooms[0]);
    }
  });

  // Message history for current room
  socket.on("message:history", (messages) => {
    messagesEl.innerHTML = "";
    lastAuthor = "";
    messages.forEach(msg => renderMessage(msg));
    scrollToBottom();
  });

  // New message received
  socket.on("message:receive", (msg) => {
    if (msg.room_id !== currentRoom?.id) return;
    renderMessage(msg);
    scrollToBottom();
  });

  // System message
  socket.on("message:system", (data) => {
    renderSystemMessage(data.text);
    scrollToBottom();
  });

  // Users list
  socket.on("users:list", (users) => {
    renderUserList(users);
  });

  // Typing indicator
  const typingUsers = new Set();
  socket.on("typing:update", ({ username, isTyping: theyAreTyping }) => {
    if (theyAreTyping) {
      typingUsers.add(username);
    } else {
      typingUsers.delete(username);
    }
    renderTypingBar(typingUsers);
  });
  
  // Reaction updates from other users
  socket.on("reaction:update", ({ messageId }) => {
    loadReactions(messageId);
  });
}

// ── JOIN A ROOM ───────────────────────────────────────────────
function joinRoom(room) {
  currentRoom = room;
  currentRoomTag.textContent = `#${room.name}`;
  messagesEl.innerHTML = "";
  lastAuthor = "";

  // Tell server we want this room's history
  socket.emit("room:join", room.id);

  // Update active room in sidebar
  document.querySelectorAll(".room-item").forEach(el => {
    el.classList.toggle("active", parseInt(el.dataset.id) === room.id);
  });
}

// ── SEND MESSAGE ──────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !socket || !currentRoom) return;

  socket.emit("message:send", {
    text,
    room_id: currentRoom.id
  });

  msgInput.value = "";
  stopTyping();
}

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
sendBtn.addEventListener("click", sendMessage);

// Enter key on auth forms
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (!document.getElementById("login-form").classList.contains("hidden")) {
    handleLogin();
  } else if (!document.getElementById("register-form").classList.contains("hidden")) {
    handleRegister();
  }
});

// ── TYPING ────────────────────────────────────────────────────
msgInput.addEventListener("input", () => {
  if (!isTyping) {
    isTyping = true;
    socket?.emit("typing:start");
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2000);
});

function stopTyping() {
  if (isTyping) {
    isTyping = false;
    socket?.emit("typing:stop");
  }
  clearTimeout(typingTimer);
}

// ── RENDER: ROOMS ─────────────────────────────────────────────
function renderRoomList(rooms) {
  roomListEl.innerHTML = "";
  rooms.forEach(room => {
    const li = document.createElement("li");
    li.className = "room-item";
    li.dataset.id = room.id;
    li.innerHTML = `<span class="room-hash">#</span>${room.name}`;
    li.onclick = () => joinRoom(room);
    roomListEl.appendChild(li);
  });
}

// ── RENDER: MESSAGES ──────────────────────────────────────────
function renderMessage(msg) {
  const isMine     = msg.author === currentUser?.username;
  const isSameUser = msg.author === lastAuthor;
  lastAuthor       = msg.author;

  const time = new Date(msg.ts).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit"
  });

  const div = document.createElement("div");
  div.className = `msg${isSameUser ? " continued" : ""}`;
  div.dataset.id = msg.id;
  div.innerHTML = `
    <div class="msg-header">
      <span class="msg-author" style="color: ${isMine ? "#f7941d" : msg.color}">
        ${escapeHtml(msg.author)}${isMine ? " (you)" : ""}
      </span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="bubble">${escapeHtml(msg.text)}</div>
    <div class="reaction-bar">
      <div class="reaction-picker hidden">
        <span class="reaction-btn" onclick="toggleReaction('${msg.id}', '🔥')">🔥</span>
        <span class="reaction-btn" onclick="toggleReaction('${msg.id}', '🏀')">🏀</span>
        <span class="reaction-btn" onclick="toggleReaction('${msg.id}', '😂')">😂</span>
        <span class="reaction-btn" onclick="toggleReaction('${msg.id}', '💯')">💯</span>
        <span class="reaction-btn" onclick="toggleReaction('${msg.id}', '😤')">😤</span>
        <span class="reaction-btn" onclick="toggleReaction('${msg.id}', '🐐')">🐐</span>
      </div>
      <div class="reaction-counts" id="counts-${msg.id}"></div>
    </div>
  `;

  // Show/hide reaction picker on hover
  div.addEventListener("mouseenter", () => {
    div.querySelector(".reaction-picker").classList.remove("hidden");
  });
  div.addEventListener("mouseleave", () => {
    div.querySelector(".reaction-picker").classList.add("hidden");
  });

  messagesEl.appendChild(div);

  // Load existing reactions for this message
  loadReactions(msg.id);
}

// ── LOAD REACTIONS ────────────────────────────────────────────
async function loadReactions(messageId) {
  try {
    const res  = await fetch(`/api/reactions/${messageId}`);
    const data = await res.json();
    renderReactionCounts(messageId, data);
  } catch (err) {
    console.error('Load reactions error:', err);
  }
}

// ── TOGGLE REACTION ───────────────────────────────────────────
async function toggleReaction(messageId, emoji) {
  const token = localStorage.getItem("hoopstalk_token");

  try {
    const res  = await fetch("/api/reactions/toggle", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message_id: messageId, emoji })
    });

    if (res.ok) {
      // Reload reactions after toggle
      loadReactions(messageId);

      // Tell everyone else via socket to refresh reactions
      socket.emit("reaction:update", { messageId });
    }

  } catch (err) {
    console.error('Toggle reaction error:', err);
  }
}

// ── RENDER REACTION COUNTS ────────────────────────────────────
function renderReactionCounts(messageId, reactions) {
  const el = document.getElementById(`counts-${messageId}`);
  if (!el) return;

  el.innerHTML = "";

  Object.entries(reactions).forEach(([emoji, data]) => {
    const hasReacted = data.users.includes(currentUser?.id);
    const span = document.createElement("span");
    span.className = `reaction-count${hasReacted ? " reacted" : ""}`;
    span.textContent = `${emoji} ${data.count}`;
    span.onclick = () => toggleReaction(messageId, emoji);
    el.appendChild(span);
  });
}

// ── RENDER: SYSTEM MESSAGE ────────────────────────────────────
function renderSystemMessage(text) {
  lastAuthor = "";
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;
  messagesEl.appendChild(div);
}

// ── RENDER: USER LIST ─────────────────────────────────────────
function renderUserList(users) {
  userCountEl.textContent = users.length;
  userListEl.innerHTML = "";
  users.forEach(user => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="user-dot" style="background:${user.color}"></span>
      <span class="user-name-label">${escapeHtml(user.username)}</span>
      ${user.username === currentUser?.username ? '<span class="user-you-tag">you</span>' : ""}
    `;
    userListEl.appendChild(li);
  });
}

// ── RENDER: TYPING BAR ────────────────────────────────────────
function renderTypingBar(typingUsers) {
  if (typingUsers.size === 0) {
    typingBar.innerHTML = "";
    return;
  }
  const names  = [...typingUsers].join(", ");
  const plural = typingUsers.size > 1 ? "are" : "is";
  typingBar.innerHTML = `
    <div class="typing-dots"><span></span><span></span><span></span></div>
    <span>${escapeHtml(names)} ${plural} typing...</span>
  `;
}

// ── HELPERS ───────────────────────────────────────────────────
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setConnectionStatus(online) {
  connDot.className     = `connection-dot ${online ? "online" : "offline"}`;
  connLabel.textContent = online ? "Connected" : "Reconnecting...";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

usersToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// ── AUTO LOGIN: check for saved token on page load ────────────
window.addEventListener("load", async () => {
  const token = localStorage.getItem("hoopstalk_token");
  if (!token) return;

  try {
    const res  = await fetch("/api/auth/verify", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      enterChat();
    } else {
      localStorage.removeItem("hoopstalk_token");
    }
  } catch (err) {
    localStorage.removeItem("hoopstalk_token");
  }
});
// ── NBA SCORES ────────────────────────────────────────────────

async function loadScores() {
  try {
    const res  = await fetch("/api/scores/today");
    const data = await res.json();

    if (!data.games || data.games.length === 0) {
      gamesContainer.innerHTML = `
        <span class="scores-loading">No games scheduled today</span>
      `;
      return;
    }

    gamesContainer.innerHTML = "";

    data.games.forEach(game => {
      const isLive  = game.status !== 'Final' && game.period > 0;
      const isFinal = game.status === 'Final';

      // Format status text
      let statusText = game.status;
      if (isLive) statusText = `Q${game.period} ${game.time || ''}`;
      if (isFinal) statusText = 'Final';

      const card = document.createElement("div");
      card.className = `game-card${isLive ? " live" : ""}`;
      card.innerHTML = `
        <div class="game-team">
          <span class="game-abbr">${game.away_team.abbr}</span>
          <span class="game-score">${game.away_team.score || 0}</span>
        </div>
        <div class="game-middle">
          <span class="game-status">${statusText}</span>
          <span class="game-vs">@</span>
        </div>
        <div class="game-team">
          <span class="game-abbr">${game.home_team.abbr}</span>
          <span class="game-score">${game.home_team.score || 0}</span>
        </div>
      `;

      // Click to jump to #nba room
      card.addEventListener("click", () => {
        const nbaRoom = [...document.querySelectorAll(".room-item")]
          .find(el => el.textContent.trim() === "#nba" || 
                      el.textContent.includes("nba"));
        if (nbaRoom) nbaRoom.click();
      });

      gamesContainer.appendChild(card);
    });

  } catch (err) {
    console.error('Scores error:', err);
    gamesContainer.innerHTML = `
      <span class="scores-loading">Could not load scores</span>
    `;
  }
}

async function loadLeaders() {
  leaderPts.querySelector(".leader-value").textContent = "Soon";
  leaderAst.querySelector(".leader-value").textContent = "Soon";
  leaderReb.querySelector(".leader-value").textContent = "Soon";
}

// Load scores when chat opens and refresh every 60 seconds
function startScoreUpdates() {
  loadScores();
  loadLeaders();
  setInterval(loadScores,  60000);
  setInterval(loadLeaders, 60000);
}