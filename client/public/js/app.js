let socket      = null;
let myUsername  = "";
let typingTimer = null;
let isTyping    = false;
let lastAuthor  = "";

const joinScreen    = document.getElementById("join-screen");
const chatScreen    = document.getElementById("chat-screen");
const usernameInput = document.getElementById("username-input");
const joinBtn       = document.getElementById("join-btn");
const msgInput      = document.getElementById("msg-input");
const sendBtn       = document.getElementById("send-btn");
const messagesEl    = document.getElementById("messages");
const userListEl    = document.getElementById("user-list");
const userCountEl   = document.getElementById("user-count");
const typingBar     = document.getElementById("typing-bar");
const connDot       = document.getElementById("conn-dot");
const connLabel     = document.getElementById("conn-label");
const usersToggle   = document.getElementById("users-toggle");
const sidebar       = document.getElementById("sidebar");

usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinChat();
});

joinBtn.addEventListener("click", joinChat);

function joinChat() {
  const name = usernameInput.value.trim();
  if (!name) {
    usernameInput.style.borderColor = "#f87171";
    setTimeout(() => usernameInput.style.borderColor = "", 1000);
    return;
  }

  myUsername = name;

  joinScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  connectSocket();
}

function connectSocket() {
  socket = io();

  socket.on("connect", () => {
    console.log("✅ Connected to server:", socket.id);
    setConnectionStatus(true);

    socket.emit("user:join", myUsername);

    msgInput.disabled = false;
    sendBtn.disabled  = false;
    msgInput.focus();
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected from server");
    setConnectionStatus(false);
    msgInput.disabled = true;
    sendBtn.disabled  = true;
  });

  socket.on("message:history", (history) => {
    messagesEl.innerHTML = "";
    lastAuthor = "";
    history.forEach(msg => renderMessage(msg));
    scrollToBottom();
  });

  socket.on("message:receive", (msg) => {
    renderMessage(msg);
    scrollToBottom();
  });

  socket.on("message:system", (data) => {
    renderSystemMessage(data.text);
    scrollToBottom();
  });

  socket.on("users:list", (users) => {
    renderUserList(users);
  });

  const typingUsers = new Set();

  socket.on("typing:update", ({ username, isTyping: theyAreTyping }) => {
    if (theyAreTyping) {
      typingUsers.add(username);
    } else {
      typingUsers.delete(username);
    }
    renderTypingBar(typingUsers);
  });
}

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !socket) return;

  socket.emit("message:send", { text });

  msgInput.value = "";
  stopTyping();
}

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

sendBtn.addEventListener("click", sendMessage);

msgInput.addEventListener("input", () => {
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing:start");
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

function renderMessage(msg) {
  const isMine     = msg.author === myUsername;
  const isSameUser = msg.author === lastAuthor;
  lastAuthor       = msg.author;

  const time = new Date(msg.ts).toLocaleTimeString([], {
    hour:   "2-digit",
    minute: "2-digit",
  });

  const div = document.createElement("div");
  div.className = `msg${isSameUser ? " continued" : ""}`;

  div.innerHTML = `
    <div class="msg-header">
      <span class="msg-author" style="color: ${isMine ? "#f7941d" : msg.color}">
        ${escapeHtml(msg.author)}${isMine ? " (you)" : ""}
      </span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="bubble">${escapeHtml(msg.text)}</div>
  `;

  messagesEl.appendChild(div);
}

function renderSystemMessage(text) {
  lastAuthor = "";
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;
  messagesEl.appendChild(div);
}

function renderUserList(users) {
  userCountEl.textContent = users.length;
  userListEl.innerHTML = "";

  users.forEach(user => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="user-dot" style="background:${user.color}"></span>
      <span class="user-name-label">${escapeHtml(user.username)}</span>
      ${user.username === myUsername ? '<span class="user-you-tag">you</span>' : ""}
    `;
    userListEl.appendChild(li);
  });
}

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