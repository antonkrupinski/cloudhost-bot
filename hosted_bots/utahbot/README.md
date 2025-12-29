# Discord ERLC Bot Setup

1. **Install dependencies:**
   ```sh
   npm install discord.js node-fetch@2 dotenv
   ```

2. **Configure your bot:**
   - Create a `.env` file in the project root:
     ```env
     BOT_TOKEN=your-bot-token-here
     CLIENT_ID=your-discord-app-client-id
     ```
   - Replace `your-bot-token-here` and `your-discord-app-client-id` with your actual Discord bot token and application client ID.

3. **Register the slash command:**
   ```sh
   node deploy-commands.js
   ```

4. **Start the bot:**
   ```sh
   node index.js
   ```

5. **Usage:**
   - In Discord, use `/erlc <text>` to run a command via the ERLC API.

---

**Note:**
- The ERLC API endpoint in `erlc.js` may need to be updated if the actual endpoint is different.
- The bot must be invited to your server with the `applications.commands` and `bot` scopes.
