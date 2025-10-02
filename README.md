# GitLab CI/CD Dashboard 🚀

Modern, real-time dashboard for monitoring and managing GitLab CI/CD pipelines.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![Docker](https://img.shields.io/badge/docker-ready-brightgreen)

## Features

- 📊 Real-time pipeline monitoring with auto-refresh
- 🎨 GitLab-style pipeline visualization (stages & jobs)
- 📝 Live log streaming with syntax highlighting
- 🔄 Manage pipelines (retry, cancel) from dashboard
- 🌓 Dark & Light themes
- 🔔 Smart notifications for pipeline events
- 📱 Responsive design

## Quick Start

### Using Docker

```bash
docker run -d \
  -p 3000:3000 \
  --name gitlab-dashboard \
  --restart unless-stopped \
  ghcr.io/ismoilovdevml/gitlab-cicd-dashboard:latest
```

Open `http://localhost:3000` in your browser.

### Connect to GitLab

1. Click **Settings** in the sidebar
2. Enter your GitLab details:
   - **GitLab URL**: `https://gitlab.com` or your self-hosted URL
   - **API Token**: Personal access token with `api` scope
3. Click **Save Configuration**

**Get API Token:**
- Go to GitLab → Settings → Access Tokens
- Create token with `api` scope
- Copy and paste in dashboard

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **State**: Zustand + LocalStorage
- **Deployment**: Docker + GitHub Actions + GHCR
- **Runtime**: Node.js 20

## Development

```bash
# Clone and install
git clone <repo-url>
cd gitlab-cicd-dashboard
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Deployment

Push to `main` branch → GitHub Actions automatically builds and pushes to GHCR.

**Make image public:**
1. Go to GitHub → Packages → gitlab-cicd-dashboard
2. Package settings → Change visibility → Public

## License

MIT

---

**Built with ❤️ using Next.js & TypeScript**
