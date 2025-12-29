// index.js
// Discord bot entry point
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const { deploycommands } = require('./deploy-commands');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const { postTicketEmbed, handleCategorySelect, handleClaim, handleClose, handleActionSelect, TICKET_CATEGORIES } = require('./ticket/ticketManager');
const { handleRename, handleAddUser } = require('./ticket/commands');
const { data: slashCommands } = require('./ticket/registerCommands');
const { runErlcCommand, getErlcPlayers } = require('./erlc');

// Set bot status to ERLC players, then to 'loading' after 5 seconds
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
        const playerCount = await getErlcPlayers();
        await client.user.setActivity(`Erlc Players: ${playerCount}`, { type: 0 });
    } catch (e) {
        await client.user.setActivity('Erlc Players: error', { type: 0 });
    }
    setTimeout(() => {
        client.user.setActivity('Loading', { type: 0 });
    }, 5000);
    // Post ticket embed on ready
    await postTicketEmbed(client);
    // Register slash commands for tickets
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands }
        );
        console.log('Ticket slash commands registered.');
    } catch (err) {
        console.error('Failed to register ticket slash commands:', err);
    }
});

client.on('interactionCreate', async interaction => {
    // Ticket dropdown for category
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category') {
        return handleCategorySelect(interaction);
    }
    // Ticket dropdown for actions
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_action') {
        return handleActionSelect(interaction);
    }
    // Ticket claim/close buttons
    if (interaction.isButton()) {
        if (interaction.customId === 'ticket_claim') return handleClaim(interaction);
        if (interaction.customId === 'ticket_close') return handleClose(interaction);
    }
    // /add-user slash command
    if (interaction.isChatInputCommand() && interaction.commandName === 'add-user') {
        return handleAddUser(interaction);
    }
    // Existing ERLC command
    if (interaction.isChatInputCommand() && interaction.commandName === 'erlc') {
        const commandText = interaction.options.getString('text');
        await interaction.deferReply({ ephemeral: true });
        try {
            await runErlcCommand(commandText);
            await interaction.editReply({ content: '✅ Successfully executed', ephemeral: true });
        } catch (err) {
            await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
        }
    }
});

// !rename command for tickets
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!rename ')) return;
    const args = message.content.slice('!rename '.length).trim().split(/ +/);
    await handleRename(message, args);
});

client.login(process.env.BOT_TOKEN);