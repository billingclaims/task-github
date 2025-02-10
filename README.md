# GitHub Issue Management Bot 🤖

A Discord bot that streamlines GitHub issue management with AI-powered issue creation and project tracking features.

## Features ✨

- **Slash Command Interface**
  - `/create-issue`: Start an issue creation flow with AI assistance
  - `/list-issues`: View open issues from GitHub project board
  - `/test`: Verify bot connectivity

- **AI-Powered Issue Generation**  
  Uses GPT-4 to analyze user input and:
  - Generate properly formatted issue descriptions
  - Suggest appropriate labels
  - Split complex requests into atomic issues
  - Handle image attachments from Discord

- **Project Management Integration**
  - Real-time sync with GitHub Projects
  - Status tracking (Backlog/In Progress/Done)
  - Assignee filtering
  - Rich embed previews with issue details

## Installation ⚙️

1. Clone repo:
```bash
git clone https://github.com/your-org/issue-bot.git
cd issue-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```env
DISCORD_TOKEN=your_discord_token
GITHUB_PAT=your_github_pat
GITHUB_REPO_OWNER=repo_owner
GITHUB_REPO_NAME=repo_name
GITHUB_PROJECT_NUMBER=123
OPENAI_API_KEY=sk-your-key
```

4. Start bot:
```bash
npm run dev
```

## Usage 🚀

### Creating Issues
```bash
/create-issue [preview:true|false]
```
1. Provide description in chat/DM
2. Attach relevant screenshots
3. Type `!done` when finished
4. Review AI-generated preview
5. Confirm or edit issues

### Listing Issues
```bash
/list-issues [assignee:username]
```
Returns interactive embed with:
- Issue statuses
- Assignees
- Description previews
- Direct links to GitHub

## Configuration 🔧

| Env Variable | Purpose | 
|--------------|---------|
| `DISCORD_TOKEN` | Discord bot token |
| `GITHUB_PAT` | GitHub Personal Access Token |
| `GITHUB_REPO_OWNER` | Organization/username |
| `GITHUB_REPO_NAME` | Repository name |
| `GITHUB_PROJECT_NUMBER` | Project board number |
| `OPENAI_API_KEY` | OpenAI API key |
| `LOG_LEVEL` | (Optional) Logging verbosity |


## Dependencies 📦

- Discord.js v14
- OpenAI API v4
- Octokit (GitHub REST/GraphQL)
- Zod (Schema validation)
- Winston (Logging)

## Requirements ✅

- Node.js v18+
- Discord server with enabled message intents
- GitHub project board setup
- OpenAI API access (GPT-4 recommended)

## Heroku Deployment 🚀

**First-Time Setup:**
1. Install Heroku CLI
```bash
npm install -g heroku
heroku login
```

2. Initialize Git (if not already done)
```bash
git init
git add .
git commit -m "Initial commit"
```

3. Create Heroku App
```bash
heroku create your-app-name
heroku git:remote -a your-app-name
```

4. Add Required Buildpack
```bash
heroku buildpacks:set heroku/nodejs
```

**Deployment Steps:**
1. Push Code to Heroku
```bash
git push heroku main
```

2. Install Config Plugin & Set Environment
```bash
heroku plugins:install heroku-config
heroku config:push --overwrite  # Requires .env file
```

3. Enable Worker Dyno
```bash
heroku ps:scale worker=1
```

**First Deployment Checklist:**
```bash
heroku logs --tail              # Monitor startup process
heroku run echo $DISCORD_TOKEN  # Verify config vars
heroku status                   # Check app health
```

## Bot Invitation 🤖

1. **Create Discord Application:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create New Application → Name it → Copy "CLIENT ID"
2. Navigate to OAuth2 → URL Generator
3. Select scopes:
   - `applications.commands`
   - `bot`
4. Bot permissions required:
   - Send Messages
   - Manage Threads
   - Attach Files
   - Read Message History

**Invite URL:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147535872&scope=bot%20applications.commands
```
Replace `YOUR_CLIENT_ID` with your actual ID from Discord portal

## Debugging 🔍

**Common Issues & Solutions:**

1. **Bot Not Responding to Commands**
```bash
heroku restart # Recycle dynos
heroku config # Verify environment variables
```

2. **Permission Errors**
- Regenerate GitHub PAT with `repo` and `write:project` scopes
- Ensure Discord bot has proper permissions in server

3. **AI Generation Failures**
```bash
heroku config:set LOG_LEVEL=debug # Enable verbose logging
heroku run npm test # Run test script
```
4. **Image Upload Issues**
- Check attachment size limits (Discord: 8MB, GitHub: 10MB)
- Verify image URLs in issue body

## Contributing 🤝

1. Fork the repo
2. Create a new branch
3. Make your changes and commit
4. Push to your fork and create a PR