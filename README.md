# 🐼 DepBlast

> **Dependency Blast Radius Scanner for GitHub PRs**

DepBlast is a GitHub App that automatically analyzes new npm dependencies in pull requests. When a developer adds a new package, DepBlast scans the full dependency impact — transitive tree, license compatibility, bundle size, security advisories, and maintainer health — then posts a detailed report as a PR comment.

## Features

- **🔍 Automatic detection** — Watches PRs for new/changed `package.json` dependencies
- **🌳 Transitive tree** — Resolves the full transitive dependency chain (up to 3 levels deep)
- **📦 Bundle size** — Estimates minified size via Bundlephobia API, falls back to npm tarball size
- **⚖️ License check** — Flags copyleft, restrictive, or unknown licenses against your repo policy
- **🔒 Security scan** — Queries npm advisory database for known vulnerabilities
- **❤️ Maintainer health** — Scores package health based on recency, maintainer count, downloads, and npm search scores
- **📝 PR comments** — Posts a detailed, formatted report as a comment on the PR
- **✅ Check runs** — Creates a check run for at-a-glance status in the GitHub UI
- **⚙️ Configurable** — Add `.depblast.yml` to your repo root for custom policies

## How it works

1. Install the DepBlast GitHub App on your repository
2. Open a PR that adds or changes a dependency in `package.json`
3. DepBlast automatically analyzes the new dependency and posts a comment like this:

```
🐼 DepBlast Report

Analyzed PR #42 in myorg/myrepo

📊 Summary
| Metric                          | Value                     |
|---------------------------------|---------------------------|
| New/changed dependencies        | 2                         |
| Transitive dependencies         | 47                        |
| Estimated total size impact     | 1.2 MB                    |
| Flags                           | ⚠️ License issues · 🔒 Security advisories |

🔍 Dependency Breakdown

#### lodash-es@4.17.21 `📦 production`

**Status:** ⚠️ License concern · 🟡 3 advisory(ies)

| Property                | Value                                           |
|-------------------------|-------------------------------------------------|
| Bundle size (min)       | 1.1 MB                                          |
| Transitive dependencies | 0 package(s)                                    |
| License                 | ⚠️ GPL-3.0                                      |
| Security                | 🔒 3 moderate advisory(ies)                     |
| Maintainer health       | 🟢 Good (4/5)                                   |
| Weekly downloads        | 42.5M                                           |
| Last published          | 2024-01-15 (167 days ago)                       |
```

## Configuration

Add a `.depblast.yml` file to your repository root:

```yaml
# DepBlast Configuration

# Allowed licenses (SPDX identifiers). If empty, uses default safe list.
allowed_licenses:
  - MIT
  - Apache-2.0
  - BSD-3-Clause
  - ISC
  - Unlicense

# Maximum transitive dependency depth to scan
max_transitive_depth: 3

# Size threshold in bytes (packages larger than this get flagged)
large_package_threshold: 500000

# Minimum maintainer health score (1-5)
min_maintainer_score: 3

# Ignored packages (prefix match)
ignore:
  - @types/
```

## Self-hosting

### Prerequisites

- Node.js 18+
- A GitHub App registration (see [docs/register.md](docs/register.md))

### Quick Start

```bash
# Clone and install
git clone https://github.com/MRL-00/depblast.git
cd depblast
npm install

# Build
npm run build

# Configure
cp .env.example .env
# Edit .env with your GitHub App credentials

# Run
npm start
```

### Docker

```bash
docker build -t depblast .
docker run -d \
  -p 3000:3000 \
  -v /path/to/private-key.pem:/app/private-key.pem \
  -e APP_ID=123456 \
  -e PRIVATE_KEY_PATH=/app/private-key.pem \
  -e WEBHOOK_SECRET=your-secret \
  depblast
```

## Deployment

DepBlast is designed to run on any Node.js hosting platform:

- **Railway / Render** — Set `start` as build command, `npm start` as start command
- **Fly.io** — Use the included Dockerfile
- **DigitalOcean App Platform** — Node.js environment with env vars
- **AWS / GCP** — Containerized via Docker

## Tech Stack

- [Probot](https://probot.github.io/) — GitHub App framework
- [npm-registry-fetch](https://www.npmjs.com/package/npm-registry-fetch) — npm registry API client
- [semver](https://www.npmjs.com/package/semver) — Version range matching
- [Bundlephobia API](https://bundlephobia.com/) — Bundle size data
- TypeScript — Type safety throughout

## License

MIT
