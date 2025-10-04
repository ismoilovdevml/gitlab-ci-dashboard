#!/bin/bash

# GitLab CI/CD Dashboard - Environment Generator
# Auto-generates secure .env file with random passwords

set -e

ENV=${1:-development}
SHOW_PASSWORDS=${SHOW_PASSWORDS:-false}

echo "🔐 Generating secure passwords for $ENV"

# Generate secure random passwords
PG_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
REDIS_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
ADMIN_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)

# Create .env file
cat > .env << EOF
# ==========================================
# GitLab CI/CD Dashboard - Environment Configuration
# ==========================================
# 🔐 AUTO-GENERATED: $(date)
# ⚠️  KEEP THIS FILE SECURE - Contains sensitive passwords!

# ==========================================
# Database Configuration
# ==========================================
POSTGRES_USER=gitlab_dashboard
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=gitlab_dashboard

# ==========================================
# Redis Configuration
# ==========================================
REDIS_PASSWORD=$REDIS_PASS

# ==========================================
# App Configuration
# ==========================================
NODE_ENV=$ENV
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GITLAB_URL=https://gitlab.com

# ==========================================
# Admin User (Auto-created on first run)
# ==========================================
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASS
ADMIN_EMAIL=admin@example.com

# ==========================================
# Security
# ==========================================
SESSION_SECRET=$SESSION_SECRET
EOF

# Set secure permissions
chmod 600 .env

echo "✅ Successfully generated .env"
echo ""

if [ "$SHOW_PASSWORDS" = "true" ]; then
    echo "📋 YOUR ADMIN CREDENTIALS:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Username: admin"
    echo "Password: $ADMIN_PASS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "⚠️  IMPORTANT:"
    echo "1. Save these credentials NOW - you won't see them again!"
    echo "2. File permissions set to 600 (owner read/write only)"
    echo "3. Never commit .env to git (.gitignore should block it)"
    echo "4. To view passwords later: cat .env"
    echo ""
else
    echo "📋 YOUR ADMIN CREDENTIALS:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Username: admin"
    echo "Password: $ADMIN_PASS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
fi

echo "🚀 Next steps:"
echo "   docker-compose up -d"
echo "   docker-compose logs -f app"
