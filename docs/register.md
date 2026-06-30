# Registering DepBlast as a GitHub App

To run DepBlast, you need to register it as a GitHub App in your GitHub account or organization.

## Steps

1. Go to **GitHub Settings → Developer settings → GitHub Apps → New GitHub App**
   - Or directly: https://github.com/settings/apps/new

2. Fill in the form:

   | Field | Value |
   |-------|-------|
   | **GitHub App name** | `depblast` (or your preferred name) |
   | **Homepage URL** | `https://github.com/MRL-00/depblast` |
   | **Webhook URL** | `https://your-deployment.com/` (your hosted app URL + `/`) |
   | **Webhook secret** | Generate a random secret (e.g. `openssl rand -hex 32`) |
   | **Permissions** | See below ↓ |
   | **Events** | Check **Pull requests** |

3. **Permissions** (Repository permissions):
   - Contents: **Read-only** (to read package.json)
   - Issues: **Read & Write** (to post PR comments)
   - Checks: **Read & Write** (to create check runs)
   - Metadata: **Read-only** (automatically added)
   - Pull requests: **Read-only**

4. Subscribe to events:
   - [x] Pull request

5. Click **Create GitHub App**.

6. After creation:
   - **Generate a private key** → download the `.pem` file
   - Note your **App ID** (shown at the top of the app page)

## Environment Setup

Create a `.env` file in the DepBlast project root:

```env
APP_ID=123456
PRIVATE_KEY_PATH=./depblast.2024-01-01.private-key.pem
WEBHOOK_SECRET=your-webhook-secret-here
```

## Installing the App

1. Go to your app's page in GitHub Settings → Developer settings → GitHub Apps
2. Click **Edit** on your DepBlast app
3. Go to **Install App** in the sidebar
4. Click **Install** next to your account or organization
5. Select the repositories you want DepBlast to monitor
6. Click **Install**
