# CloudHost Bot

A Discord bot for hosting user bots with premium features.

## Setup

1. Install dependencies: `npm install`
2. Edit `config.json` with your bot's token, client ID, and guild ID:
   ```json
   {
     "DISCORD_TOKEN": "your_bot_token_here",
     "CLIENT_ID": "your_client_id_here",
     "GUILD_ID": "your_guild_id_here"
   }
   ```
3. Run the bot: `node index.js`

## Features

- `/host`: Host a Discord bot by uploading a zip file or cloning from GitHub (premium: unlimited, free: 1 time)
  - Options: zipfile (attachment), github_repo (string), discord_token (string), env_vars (string, comma-separated key=value)
- `/hosted`: List your hosted bots with a dropdown to delete them
- `/premium`: Check premium status
- `/addpremium <user>`: Admin command to add premium (only for user ID 1045370637776064612)

## Notes

- The bot simulates hosting by saving uploaded zip files.
- Actual deployment of bots is not implemented; this is a framework for such functionality.