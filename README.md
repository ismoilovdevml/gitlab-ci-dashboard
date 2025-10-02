# GitLab CI/CD Enterprise Dashboard

Modern, real-time monitoring and management dashboard for GitLab CI/CD pipelines.

## Features

- 📊 **Real-time Dashboard** - Live updates every 10 seconds
- 🚀 **Pipeline Management** - View, retry, and cancel pipelines
- 📋 **Job Monitoring** - Track job status and view logs
- 🏃 **Runner Status** - Monitor GitLab runners
- 🎨 **Modern UI/UX** - Dark theme with beautiful interface
- 🔄 **Auto-refresh** - Configurable refresh intervals

## Quick Start with Docker

### 1. Build and run
```bash
docker-compose up -d --build
```

### 2. View logs
```bash
docker-compose logs -f
```

### 3. Open browser
```
http://localhost:3000
```

### 4. Stop
```bash
docker-compose down
```

## GitLab Token

Token already configured in `.env.local`:
- URL: `https://gitlab.com`
- Token: Already set

## Dashboard Tabs

- **Overview** - Statistics, active pipelines
- **Pipelines** - Browse projects, pipelines, jobs, logs
- **Projects** - All GitLab projects
- **Runners** - Runner monitoring
- **Settings** - Auto-refresh config
