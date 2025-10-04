# GitLab CI/CD Dashboard 🚀

Modern, real-time dashboard for monitoring and managing GitLab CI/CD pipelines with advanced alerting system.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![Docker](https://img.shields.io/badge/docker-ready-brightgreen) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue) ![Redis](https://img.shields.io/badge/Redis-latest-red)

## ✨ Features

### Core Features
- 📊 **Real-time Pipeline Monitoring** - Auto-refresh with live updates
- 🎨 **GitLab-style Visualization** - Beautiful pipeline stages & jobs view
- 📝 **Live Log Streaming** - Real-time logs with syntax highlighting
- 🔄 **Pipeline Management** - Retry, cancel, and manage pipelines
- 🌓 **Dark & Light Themes** - Comfortable viewing in any environment
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

## 🚀 Quick Start

### Production Deployment (Docker Compose)

```bash
# 1. Clone repository
git clone https://github.com/ismoilovdevml/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard

# 2. Setup environment variables
cp .env.example .env

# 3. Review and edit .env file if needed
nano .env

# 6. Start all services (PostgreSQL + Redis + App)
docker-compose up -d

# 7. View logs
docker-compose logs -f app
```

Open `http://localhost:3000` in your browser.

**First Login:**
- URL: `http://localhost:3000/login`
- Username: `admin` (or value from `ADMIN_USERNAME` in .env)
- Password: Check `ADMIN_PASSWORD` in .env file

**Services:**
- Dashboard UI: `http://localhost:3000`
- PostgreSQL: Internal network only (secure by default)
- Redis: Internal network only (secure by default)

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
- **Database**: PostgreSQL 17
- **Cache**: Redis (latest)
- **ORM**: Prisma
- **API**: Next.js API Routes

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