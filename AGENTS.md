# AGENTS.md - AI Agent Policy for GitLab CI/CD Dashboard

This project uses **bd** (beads) for issue tracking. Run `bd onboard` or `bd prime` for dynamic workflow context.

## Project Overview

**GitLab CI/CD Dashboard** - A modern, real-time web dashboard for monitoring GitLab pipelines.

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **UI**: React 19, TypeScript 5.9, Tailwind CSS
- **State**: Zustand with persistence
- **Backend**: Prisma ORM, PostgreSQL 17, Redis
- **Testing**: Jest, React Testing Library

### Repository Structure
```
src/
├── app/           # Next.js pages & API routes
├── components/    # React components
├── hooks/         # Custom React hooks
├── lib/           # Utilities & helpers
└── store/         # Zustand stores
prisma/            # Database schema & migrations
public/            # Static assets
```

---

## bd Workflow - MANDATORY

### Critical Policy: All Work Must Be Tracked

**BEFORE starting ANY work, agents MUST:**
1. Check for existing issues: `bd ready` or `bd list`
2. Create an issue if none exists
3. Update issue status throughout work
4. Close the issue upon completion

### Quick Reference

| Command | Purpose |
|---------|---------|
| `bd ready` | Find unblocked work ready to start |
| `bd list --status open` | List all open issues |
| `bd show <id>` | View issue details |
| `bd create "Title" --type task` | Create a new issue |
| `bd update <id> --status in_progress` | Mark work as started |
| `bd close <id>` | Complete and close issue |
| `bd sync` | Sync with git |

---

## Session Workflow

### Starting a Session

```bash
bd status                 # Check project overview
bd ready                  # Find available work
bd list --status open     # See all open issues
```

### Claiming Work

```bash
bd update <id> --status in_progress
# OR atomic claim:
bd update <id> --claim
```

### Creating Issues

Always include: type, priority, description

```bash
# Bug
bd create "Fix auth redirect loop" --type bug --priority 1 \
  --description "Users stuck in redirect when session expires"

# Feature
bd create "Add dark mode toggle" --type feature --priority 2 \
  --description "Allow theme switching in settings"

# Task
bd create "Update dependencies" --type task --priority 3 \
  --labels "maintenance"

# Epic (large features)
bd create "DORA metrics dashboard" --type epic --priority 2
```

### Updating Progress

```bash
bd update <id> --status in_progress
bd comments add <id> "Completed API, working on frontend"
bd label add <id> frontend,api
```

### Completing Work

1. Ensure all acceptance criteria met
2. Run quality gates:
   ```bash
   npm run lint
   npm run test
   npm run build
   ```
3. Close with reason:
   ```bash
   bd close <id> --reason "Implemented and tested"
   ```

---

## Landing the Plane (Session End)

**MANDATORY WORKFLOW when ending a session:**

1. **File issues** for remaining work
2. **Run quality gates** (if code changed)
3. **Update issue status** - Close finished, update in-progress
4. **PUSH TO REMOTE**:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Verify** - All changes committed AND pushed

**CRITICAL**: Work is NOT complete until `git push` succeeds!

---

## Issue Types & Labels

### Types
| Type | Use For |
|------|---------|
| `bug` | Defects, errors |
| `feature` | New functionality |
| `task` | General work |
| `chore` | Maintenance, refactoring |
| `epic` | Large features with subtasks |

### Labels
| Label | Category |
|-------|----------|
| `frontend` | React/UI components |
| `backend` | API routes, database |
| `api` | GitLab API integration |
| `auth` | Authentication |
| `performance` | Optimizations |
| `security` | Security-related |
| `testing` | Test coverage |
| `docker` | Container/deployment |

### Priority
| Level | Meaning |
|-------|---------|
| P0 | Critical - Immediate |
| P1 | High - Same day |
| P2 | Medium - This sprint |
| P3 | Low - Backlog |
| P4 | Wishlist |

---

## Dependencies & Discovery

### Managing Dependencies
```bash
bd dep add <issue-a> <issue-b>   # A depends on B
bd dep tree <id>                  # View dependencies
bd blocked                        # Show blocked issues
```

### Finding Work
```bash
bd search "authentication"        # Search by text
bd list --type bug --status open  # Filter by type
bd list --label frontend          # Filter by label
bd activity                       # Recent activity
```

---

## Development Standards

### Before Creating PR
1. All related issues updated
2. Tests pass: `npm run test`
3. Lint passes: `npm run lint`
4. Build succeeds: `npm run build`

### Code Quality
- TypeScript strict mode enabled
- ESLint must pass
- Jest tests for new functionality
- Components use lazy loading

### File Naming
- Components: PascalCase (`PipelineCard.tsx`)
- Hooks: camelCase with `use` prefix (`useConfigLoader.ts`)
- API routes: kebab-case directories
- Tests: `.test.ts` suffix

---

## The Golden Rules

1. **Always check `bd ready` first** - Find existing work before creating new
2. **Track everything** - Every piece of work needs an issue
3. **Update status** - Keep issues current as work progresses
4. **Close with context** - Include reason when closing
5. **Sync before leaving** - Always `bd sync` at session end
6. **Avoid duplicates** - Search before creating new issues
7. **Use dependencies** - Link related issues properly

---

## Perles Integration

Run `perles` for a terminal UI Kanban board view of issues.

## bd Help

For complete command reference:
```bash
bd --help
bd <command> --help
bd quickstart
bd prime
```
