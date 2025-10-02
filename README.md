# GitLab CI/CD Dashboard

Enterprise-level GitLab CI/CD monitoring dashboard built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- 📊 **Real-time Monitoring** - Auto-refresh every 10 seconds
- 🚀 **Pipeline Management** - View, retry, and cancel pipelines
- 📝 **Live Logs** - Real-time log streaming for running jobs with syntax highlighting
- 🎯 **Multi-Project Support** - Monitor all your GitLab projects in one place
- 🏃 **Runner Status** - Track GitLab runner availability and health
- 🌙 **Dark/Light Theme** - Modern UI with theme switching
- 🔍 **Advanced Filtering** - Search and filter pipelines by status
- 📈 **Statistics Dashboard** - Quick overview of pipeline metrics

## Quick Start

### Docker (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd gitlabci-dashboard

# Start with Docker Compose
docker-compose up -d

# Open browser
open http://localhost:3000
```

### Local Development

```bash
# Install dependencies
npm install

# Create .env.local file
cat > .env.local << EOF
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your-gitlab-token-here
NEXT_PUBLIC_GITLAB_URL=https://gitlab.com
NEXT_PUBLIC_GITLAB_TOKEN=your-gitlab-token-here
EOF

# Run development server
npm run dev

# Open browser
open http://localhost:3000
```

## Configuration

### GitLab Token

1. Go to GitLab → Settings → Access Tokens
2. Create token with scopes: `api`, `read_api`, `read_repository`
3. Add token to Settings page in dashboard or `.env.local` file

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITLAB_URL` | GitLab instance URL | Yes |
| `GITLAB_TOKEN` | GitLab personal access token | Yes |
| `NEXT_PUBLIC_GITLAB_URL` | Public GitLab URL | Yes |
| `NEXT_PUBLIC_GITLAB_TOKEN` | Public GitLab token | Yes |

## Usage

### Dashboard Overview
- View active pipelines, success/failure rates
- See recent activity (last 10 pipelines)
- Click stats cards to filter pipelines

### Pipelines
- Search and filter all pipelines
- Retry or cancel pipelines
- View detailed job logs

### Projects
- Monitor all GitLab projects
- View project pipeline statistics
- Access project details

### Runners
- Track runner status and availability
- Monitor runner health
- View runner tags and descriptions

### Settings
- Configure GitLab URL and token
- Switch between dark/light themes
- Enable/disable auto-refresh

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **API**: GitLab API v4
- **Container**: Docker + Docker Compose

## CI/CD

GitHub Actions workflow included for:
- Linting and type checking
- Building application
- Docker image creation and testing
- Automatic deployment

Test locally:
```bash
# Install act
brew install act

# Run workflow locally
act -j build-and-test --container-architecture linux/amd64
```

## Project Structure

```
├── src/
│   ├── app/              # Next.js app router
│   ├── components/       # React components
│   ├── lib/             # GitLab API client
│   └── store/           # Zustand store
├── .github/
│   └── workflows/       # GitHub Actions
├── docker-compose.yml   # Docker configuration
├── Dockerfile          # Container image
└── tailwind.config.ts  # Tailwind CSS config
```

## License

MIT
