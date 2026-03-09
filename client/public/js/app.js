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
const picksView      = document.getElementById("picks-view");
const chatView       = document.getElementById("chat-view");
const picksList      = document.getElementById("picks-list");
const leaderboardList = document.getElementById("leaderboard-list");
const pickGameSelect = document.getElementById("pick-game-select");
const pickTeams      = document.getElementById("pick-teams");
const pickAwayBtn    = document.getElementById("pick-away-btn");
const pickHomeBtn    = document.getElementById("pick-home-btn");
const submitPickBtn  = document.getElementById("submit-pick-btn");
const pickError      = document.getElementById("pick-error");
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
  closeSidebar(); // close sidebar on mobile when room is selected
  currentRoom = room;
  currentRoomTag.textContent = `#${room.name}`;
  lastAuthor = "";

  // Show picks view for #picks room, chat view for everything else
  if (room.name === 'picks') {
    picksView.classList.remove("hidden");
    chatView.classList.add("hidden");
    loadPicks();
    loadLeaderboard();
    populateGameSelect();
  } else {
    picksView.classList.add("hidden");
    chatView.classList.remove("hidden");
    messagesEl.innerHTML = "";
    socket.emit("room:join", room.id);
  }

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
  window.allRooms = rooms;
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
  userListEl.innerHTML = "";
  userCountEl.textContent = users.length;

  users.forEach(user => {
    const isMe = user.username === currentUser?.username;

    // Find room name from currentRoom or rooms list
    let roomName = "";
    if (user.currentRoom) {
      const room = window.allRooms?.find(r => r.id === user.currentRoom);
      roomName = room ? `#${room.name}` : "";
    }

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="user-dot" style="background:${user.color}"></span>
      <span class="user-name-label">${escapeHtml(user.username)}</span>
      ${roomName ? `<span class="user-room-tag">${roomName}</span>` : ""}
      ${isMe ? '<span class="user-you-tag">you</span>' : ""}
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
  const gamesContainer = document.getElementById("games-container");
  if (!gamesContainer) return;
  
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
      if (isLive) {
        statusText = `Q${game.period} ${game.time || ''}`.trim();
      } else if (isFinal) {
        statusText = 'Final';
      } else if (game.status.includes('T')) {
        // Clean up raw date format for upcoming games
        const gameTime = new Date(game.status);
        statusText = gameTime.toLocaleTimeString([], {
          hour:   '2-digit',
          minute: '2-digit'
        });
      }

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

      card.addEventListener("click", () => {
        const nbaRoom = [...document.querySelectorAll(".room-item")]
          .find(el => el.textContent.includes("nba"));
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
  const leaderPts = document.getElementById("leader-pts");
  const leaderAst = document.getElementById("leader-ast");
  const leaderReb = document.getElementById("leader-reb");
  if (!leaderPts) return;
}

// Load scores when chat opens and refresh every 60 seconds
function startScoreUpdates() {
  loadScores();
  loadLeaders();
  setInterval(loadScores,  60000);
  setInterval(loadLeaders, 60000);
}

// ── PICKS FEATURE ─────────────────────────────────────────────

let selectedTeam    = null;
let selectedGame    = null;
let pickFormVisible = false;

function togglePickForm() {
  pickFormVisible = !pickFormVisible;
  const form = document.getElementById("pick-form");
  if (pickFormVisible) {
    form.classList.remove("hidden");
  } else {
    form.classList.add("hidden");
    resetPickForm();
  }
}

function resetPickForm() {
  selectedTeam = null;
  selectedGame = null;
  pickGameSelect.value = "";
  pickTeams.classList.add("hidden");
  pickAwayBtn.classList.remove("selected");
  pickHomeBtn.classList.remove("selected");
  submitPickBtn.disabled = true;
  pickError.textContent  = "";
}

// Populate game dropdown from today's scores
async function populateGameSelect() {
  try {
    const res  = await fetch("/api/scores/today");
    const data = await res.json();

    pickGameSelect.innerHTML = '<option value="">Select a game...</option>';

    if (!data.games || data.games.length === 0) {
      pickGameSelect.innerHTML = '<option value="">No games today</option>';
      return;
    }

    data.games.forEach(game => {
      const option = document.createElement("option");
      option.value = JSON.stringify(game);
      option.textContent = `${game.away_team.abbr} @ ${game.home_team.abbr} — ${game.status}`;
      pickGameSelect.appendChild(option);
    });

  } catch (err) {
    console.error('Populate games error:', err);
  }
}

// When user selects a game show team buttons
pickGameSelect.addEventListener("change", () => {
  const val = pickGameSelect.value;
  if (!val) {
    pickTeams.classList.add("hidden");
    selectedGame = null;
    return;
  }

  selectedGame = JSON.parse(val);
  pickAwayBtn.textContent = selectedGame.away_team.name;
  pickHomeBtn.textContent = selectedGame.home_team.name;
  pickAwayBtn.classList.remove("selected");
  pickHomeBtn.classList.remove("selected");
  selectedTeam = null;
  submitPickBtn.disabled = true;
  pickTeams.classList.remove("hidden");
});

function selectTeam(side) {
  selectedTeam = side === 'away'
    ? selectedGame.away_team
    : selectedGame.home_team;

  pickAwayBtn.classList.toggle("selected", side === 'away');
  pickHomeBtn.classList.toggle("selected", side === 'home');
  submitPickBtn.disabled = false;
}

async function submitPick() {
  if (!selectedGame || !selectedTeam) return;
  const token = localStorage.getItem("hoopstalk_token");
  pickError.textContent = "";

  try {
    const res = await fetch("/api/picks", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        game_id:          selectedGame.id,
        game_description: `${selectedGame.away_team.abbr} @ ${selectedGame.home_team.abbr}`,
        picked_team:      selectedTeam.name,
      })
    });

    const data = await res.json();
    if (!res.ok) {
      pickError.textContent = data.error;
      return;
    }

    togglePickForm();
    loadPicks();

    // Notify via socket so everyone sees new pick
    socket.emit("pick:new", { roomId: currentRoom.id });

  } catch (err) {
    pickError.textContent = "Something went wrong";
  }
}

async function loadPicks() {
  try {
    const res  = await fetch("/api/picks");
    const data = await res.json();

    picksList.innerHTML = "";

    if (!data.picks.length) {
      picksList.innerHTML = `
        <div class="lb-empty">No picks yet — be the first! 🏀</div>
      `;
      return;
    }

    data.picks.forEach(pick => renderPick(pick));

  } catch (err) {
    console.error('Load picks error:', err);
  }
}

function renderPick(pick) {
  const isOwner    = pick.author_id === currentUser?.id;
  const isPending  = pick.result === 'pending';

  const myVote = pick.votes.all.find(v => v.user_id === currentUser?.id);

  const div = document.createElement("div");
  div.className = `pick-card ${isPending ? '' : pick.result}`;
  div.innerHTML = `
    <div class="pick-card-header">
      <span class="pick-author" style="color:${pick.color}">
        ${escapeHtml(pick.author)}
      </span>
      <span class="pick-result-badge ${pick.result}">
        ${pick.result === 'pending' ? '⏳ Pending' :
          pick.result === 'won'     ? '✅ Won' : '❌ Lost'}
      </span>
    </div>
    <div class="pick-game-desc">${escapeHtml(pick.game_description)}</div>
    <div class="pick-selection">🏀 ${escapeHtml(pick.picked_team)}</div>
    <div class="pick-vote-row">
      <button
        class="vote-btn agree ${myVote?.vote === 'agree' ? 'voted' : ''}"
        onclick="voteOnPick('${pick.id}', 'agree')">
        👍 ${pick.votes.agrees}
      </button>
      <button
        class="vote-btn disagree ${myVote?.vote === 'disagree' ? 'voted' : ''}"
        onclick="voteOnPick('${pick.id}', 'disagree')">
        👎 ${pick.votes.disagrees}
      </button>
    </div>
    ${isOwner && isPending ? `
      <div class="mark-result-row">
        <span style="font-size:.75rem;color:var(--muted)">Mark result:</span>
        <button class="mark-btn won"  onclick="markResult('${pick.id}', 'won')">✅ Won</button>
        <button class="mark-btn lost" onclick="markResult('${pick.id}', 'lost')">❌ Lost</button>
      </div>
    ` : ''}
  `;

  picksList.appendChild(div);
}

async function voteOnPick(pickId, vote) {
  const token = localStorage.getItem("hoopstalk_token");

  try {
    await fetch(`/api/picks/${pickId}/vote`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ vote })
    });

    loadPicks();

  } catch (err) {
    console.error('Vote error:', err);
  }
}

async function markResult(pickId, result) {
  const token = localStorage.getItem("hoopstalk_token");

  try {
    await fetch(`/api/picks/${pickId}/result`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ result })
    });

    loadPicks();
    loadLeaderboard();

  } catch (err) {
    console.error('Mark result error:', err);
  }
}

async function loadLeaderboard() {
  try {
    const res  = await fetch("/api/picks/leaderboard");
    const data = await res.json();

    leaderboardList.innerHTML = "";

    if (!data.leaderboard.length) {
      leaderboardList.innerHTML = `
        <div class="lb-empty">No results yet — make some picks! 🏀</div>
      `;
      return;
    }

    data.leaderboard.forEach(user => {
      const rankClass = user.rank === 1 ? 'gold' :
                        user.rank === 2 ? 'silver' :
                        user.rank === 3 ? 'bronze' : '';
      const div = document.createElement("div");
      div.className = "leaderboard-row";
      div.innerHTML = `
        <span class="lb-rank ${rankClass}">${user.rank}</span>
        <span class="lb-name" style="color:${user.color}">
          ${escapeHtml(user.username)}
        </span>
        <span class="lb-record">${user.wins}W - ${user.losses}L</span>
        <span class="lb-winrate">${user.winRate}%</span>
      `;
      leaderboardList.appendChild(div);
    });

  } catch (err) {
    console.error('Leaderboard error:', err);
  }
}

// ── MOBILE SIDEBAR TOGGLE ─────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById("sidebar");
  const overlay  = document.getElementById("sidebar-overlay");
  const isOpen   = sidebar.classList.contains("open");

  if (isOpen) {
    closeSidebar();
  } else {
    sidebar.classList.add("open");
    overlay.classList.add("active");
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  sidebar.classList.remove("open");
  overlay.classList.remove("active");
}