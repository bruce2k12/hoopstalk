# 🏀 HoopsTalk

A real-time basketball chat app for NBA fans. Chat with friends, track live scores, and make game predictions — all in one place.

**Live Demo:** [hoopstalk-production.up.railway.app](https://hoopstalk-production.up.railway.app)

---

## Features

- 💬 **Real-time chat** — instant messaging powered by Socket.io
- 🔐 **Authentication** — register and login with a secure PIN
- 🏠 **Multiple rooms** — General, NBA, Lakers, Trade Talk, Fantasy, Picks
- 🏀 **Live NBA scores** — today's games with live score updates every 60 seconds
- 😤 **Emoji reactions** — react to messages with 🔥🏀😂💯😤🐐
- 🏆 **Picks & Predictions** — pick game winners, vote on friends' picks, climb the leaderboard
- 📱 **PWA** — installable on iPhone and Android like a native app
- 👥 **Online users** — see who's online and which room they're in

---

## Tech Stack

**Backend**
- Node.js + Express
- Socket.io (real-time messaging)
- Supabase (PostgreSQL database)
- JWT + bcrypt (authentication)
- balldontlie.io API (NBA scores)

**Frontend**
- Vanilla HTML, CSS, JavaScript
- Progressive Web App (PWA)

**Deployment**
- Railway (backend + hosting)
- GitHub (version control)

---

## Getting Started

### Prerequisites
- Node.js v18+
- Supabase account
- balldontlie.io API key

### Installation
```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/hoopstalk.git
cd hoopstalk

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your Supabase and API keys

# Run locally
npm run dev
```

### Environment Variables
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_jwt_secret
BALLDONTLIE_API_KEY=your_api_key
PORT=3000
```

---

## Database Schema
```
users       — id, username, pin_hash, color
rooms       — id, name, description
messages    — id, user_id, room_id, text, created_at
reactions   — id, message_id, user_id, emoji
picks       — id, user_id, game_id, picked_team, result
pick_votes  — id, pick_id, user_id, vote
```

---

## Roadmap

- [ ] Push notifications
- [ ] Live stat leaders
- [ ] Auto pick results from scores API
- [ ] React Native mobile app

---

## Author

**Ramad Bruce**
- GitHub: [@bruce2k12](https://github.com/YOUR_USERNAME)
- LinkedIn: [ramad-bruce-97](https://linkedin.com/in/ramad-bruce-97)

---

Built with ❤️ and 🏀