# GitLab CI/CD Dashboard 🚀

Modern, real-time dashboard for monitoring and managing GitLab CI/CD pipelines with advanced alerting system.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![Docker](https://img.shields.io/badge/docker-ready-brightgreen) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue) ![Redis](https://img.shields.io/badge/Redis-7-red)

## ✨ Features

### Core Features
- 📊 **Real-time Pipeline Monitoring** - Auto-refresh with live updates
- 🎨 **GitLab-style Visualization** - Beautiful pipeline stages & jobs view
- 📝 **Live Log Streaming** - Real-time logs with syntax highlighting
- 🔄 **Pipeline Management** - Retry, cancel, and manage pipelines
- 🌓 **Dark & Light Themes** - Comfortable viewing in any environment
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

### Alerting System ⚡
- 🎯 **Instant Webhook Alerts** - GitLab webhooks for real-time notifications (0-2 seconds)
- 📢 **Multi-Channel Support** - Telegram, Slack, Discord, Email, Custom Webhooks
- 🎛️ **Flexible Alert Rules** - Configure alerts per project or globally
- 📊 **Alert History** - Track all sent notifications
- 🔔 **Smart Filtering** - Alert only on specific events (success, failed, running, canceled)

### Infrastructure
- 🗄️ **PostgreSQL Database** - Persistent storage for configurations and history
- ⚡ **Redis Cache** - Fast data access and reduced API calls
- 🐳 **Docker Compose** - One-command deployment with all services

## 🚀 Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/ismoilovdevml/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard

# Start all services (PostgreSQL + Redis + App)
docker-compose up -d

# View logs
docker-compose logs -f app
```

Open `http://localhost:3000` in your browser.

**Services:**
- Dashboard UI: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (reset database)
docker-compose down -v
```

## ⚙️ Configuration

### 1. Connect to GitLab

1. Open `http://localhost:3000`
2. Click **Settings** in the sidebar
3. Enter your GitLab details:
   - **GitLab URL**: `https://gitlab.com` or your self-hosted URL
   - **API Token**: Personal access token with `api` scope
4. Click **Save Configuration**

**Get API Token:**
- Go to GitLab → Settings → Access Tokens
- Create token with `api` scope
- Copy and paste in dashboard

### 2. Setup Webhook Alerts (Instant Notifications)

1. Go to **Alerting** tab → **Webhook Setup ⚡**
2. Copy the webhook URL: `http://localhost:3000/api/webhook/gitlab`
3. **For local development**, expose your localhost using:
   ```bash
   # Option 1: ngrok
   ngrok http 3000
   # You'll get: https://abc123.ngrok.io

   # Option 2: Cloudflare Tunnel
   cloudflared tunnel --url http://localhost:3000
   ```
4. Add webhook in GitLab:
   - Project → Settings → Webhooks
   - URL: `https://your-tunnel-url.ngrok.io/api/webhook/gitlab`
   - Trigger: ✅ Pipeline events
   - Click "Add webhook"

### 3. Configure Alert Channels

1. Go to **Alerting** tab → **Channels** tab
2. Enable and configure your preferred channel:

**Telegram Setup:**
```bash
# 1. Create bot with @BotFather
# 2. Get bot token: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
# 3. Get chat ID (send message to bot, then check):
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

3. Add bot token and chat ID in dashboard
4. Click "Test Connection" to verify

### 4. Create Alert Rules

1. Go to **Alerting** tab → **Alert Rules** tab
2. Click "Add Alert Rule"
3. Configure:
   - **Name**: Custom rule name
   - **Project**: Select project or "All Projects"
   - **Events**: Choose when to alert (Success, Failed, Running, Canceled)
   - **Channels**: Select notification channels (Telegram, Slack, etc)
4. Enable the rule

**Done!** You'll now receive instant alerts when pipelines change status ⚡

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript 5.9
- **Styling**: Tailwind CSS
- **State Management**: Zustand with persistence
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **ORM**: Prisma
- **API**: Next.js API Routes

### DevOps
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Registry**: Docker Hub
- **Multi-arch**: AMD64 + ARM64

## 🛠️ Development

### Local Development

```bash
# Clone repository
git clone https://github.com/ismoilovdevml/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your database credentials

# Start database services
docker-compose up -d postgres redis

# Run database migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

### Docker Build

```bash
# Build image
docker-compose build

# Build without cache
docker-compose build --no-cache

# Run all services
docker-compose up -d
```


If you have any questions or issues, please open an issue on GitHub.

---

**Built with ❤️ using Next.js & TypeScript**
