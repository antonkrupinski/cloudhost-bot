require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const express = require('express');
// Minimal Express server for Render health check
const healthApp = express();
const PORT = process.env.PORT || 3000;
healthApp.get('/healthz', (req, res) => res.send('ok'));
healthApp.listen(PORT, () => console.log(`Health check server running on port ${PORT}`));
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn, exec } = require('child_process');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setPresence({
    activities: [{
      name: 'CloudHost V1',
      type: 3
    }],
    status: 'online'
  });
  console.log('Bot status set to: Watching CloudHost V1');
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Data files
const PREMIUM_FILE = path.join(__dirname, 'data', 'premium.json');
const USAGE_FILE = path.join(__dirname, 'data', 'usage.json');
const HOSTED_FILE = path.join(__dirname, 'data', 'hosted.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Load data
function loadData(file) {
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return file === PREMIUM_FILE ? [] : {};
}

// Save data
function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let premiumUsers = loadData(PREMIUM_FILE);
let usage = loadData(USAGE_FILE);
let hosted = loadData(HOSTED_FILE);
let runningBots = {}; // botName: childProcess
let userEnvVars = {}; // userId: {repo, vars: []}

function parseEnvVars(envString) {
  if (!envString) return {};
  const env = {};
  envString.split(',').forEach(pair => {
    const [key, ...value] = pair.trim().split('=');
    if (key) env[key] = value.join('=');
  });
  return env;
}

async function hostBot(interaction, githubRepo, envVars, discordToken) {
  const embed = new EmbedBuilder()
    .setTitle('Hosting Your Bot')
    .setDescription('Initializing...')
    .setColor(0x0099ff);

  await interaction.editReply({ embeds: [embed] });

  let botName;
  let botDir;

  try {
    if (githubRepo) {
      // GitHub method
      embed.setDescription('Cloning GitHub repository...');
      await interaction.editReply({ embeds: [embed] });

      const repoName = githubRepo.split('/').pop().replace('.git', '');
      botName = repoName;
      let counter = 1;
      while (hosted[interaction.user.id] && hosted[interaction.user.id].includes(botName)) {
        botName = `${repoName}_${counter}`;
        counter++;
      }
      botDir = path.join(__dirname, 'hosted_bots', botName);
      if (!fs.existsSync(path.join(__dirname, 'hosted_bots'))) {
        fs.mkdirSync(path.join(__dirname, 'hosted_bots'));
      }

      await new Promise((resolve, reject) => {
        exec(`git clone ${githubRepo} "${botDir}"`, (error, stdout, stderr) => {
          if (error) {
            reject(new Error('Failed to clone repository'));
          } else {
            resolve();
          }
        });
      });
    }

    // Create .env file if env vars provided
    if (envVars && envVars.length > 0) {
      embed.setDescription('Setting up environment variables...');
      await interaction.editReply({ embeds: [embed] });

      const envContent = envVars.map(v => `${v.name}=${v.value}`).join('\n');
      fs.writeFileSync(path.join(botDir, '.env'), envContent);
    }

    // Try to run the bot if it's a Node.js project
    const packageJsonPath = path.join(botDir, 'package.json');
    let started = false;
    let reason = '';
    if (fs.existsSync(packageJsonPath)) {
      embed.setDescription('Found package.json. Checking for main file...');
      await interaction.editReply({ embeds: [embed] });

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const mainFile = packageJson.main || 'index.js';
      const mainPath = path.join(botDir, mainFile);

      if (fs.existsSync(mainPath)) {
        embed.setDescription('Installing dependencies...');
        await interaction.editReply({ embeds: [embed] });

        await new Promise((resolve, reject) => {
          exec('npm install', { cwd: botDir }, (error, stdout, stderr) => {
            if (error) {
              reject(new Error('Failed to install dependencies'));
            } else {
              resolve();
            }
          });
        });

        embed.setDescription('Starting bot...');
        await interaction.editReply({ embeds: [embed] });

        const envObj = {};
        envVars.forEach(v => envObj[v.name] = v.value);

        const child = spawn('node', [mainFile], { cwd: botDir, stdio: 'inherit', env: { ...process.env, ...envObj } });
        runningBots[botName] = child;

        child.on('exit', (code) => {
          delete runningBots[botName];
        });

        child.on('error', (err) => {
          delete runningBots[botName];
        });

        started = true;
      } else {
        reason = `Main file '${mainFile}' not found.`;
      }
    } else {
      reason = `No package.json found.`;
    }

    hosted[interaction.user.id] = hosted[interaction.user.id] || [];
    hosted[interaction.user.id].push(botName);
    saveData(HOSTED_FILE, hosted);

    usage[interaction.user.id] = (usage[interaction.user.id] || 0) + 1;
    saveData(USAGE_FILE, usage);

    const status = started ? '✅ Successfully hosted and started!' : `⚠️ Hosted but could not be started.\n${reason}`;
    embed.setDescription(status)
      .setTitle(`Bot Hosted: ${botName}`)
      .setColor(started ? 0x00ff00 : 0xffa500);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    embed.setDescription('❌ Failed to host the bot.')
      .setColor(0xff0000);
    await interaction.editReply({ embeds: [embed] });
  }
}

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('host')
    .setDescription('Host a Discord bot by uploading a zip file or cloning from GitHub with interactive env setup')
    .addAttachmentOption(option =>
      option.setName('zipfile')
        .setDescription('The zip file containing your bot code')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('github_repo')
        .setDescription('GitHub repository URL to clone (e.g., https://github.com/user/repo)')
        .setRequired(false)
    )
      ,
  new SlashCommandBuilder()
    .setName('hosted')
    .setDescription('List your hosted bots'),
  new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Check if you are a premium user'),
  new SlashCommandBuilder()
    .setName('addpremium')
    .setDescription('Add a user to premium (admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to add to premium')
        .setRequired(true)
    ),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu() && !interaction.isButton() && !interaction.isModalSubmit()) return;

  const { commandName, user } = interaction;

  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (customId.startsWith('start_')) {
      const botId = customId.slice(6);
      if (!hosted[interaction.user.id] || !hosted[interaction.user.id].includes(botId)) {
        return interaction.reply({ content: 'Bot not found.', ephemeral: true });
      }

      if (runningBots[botId]) {
        return interaction.reply({ content: 'Bot is already running.', ephemeral: true });
      }

      // Start the bot
      const botDir = path.join(__dirname, 'hosted_bots', botId);
      const packageJsonPath = path.join(botDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return interaction.reply({ content: 'No package.json found.', ephemeral: true });
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const mainFile = packageJson.main || 'index.js';
      const mainPath = path.join(botDir, mainFile);

      if (!fs.existsSync(mainPath)) {
        return interaction.reply({ content: `Main file ${mainFile} not found.`, ephemeral: true });
      }

      // Load env
      const envObj = {};
      const envPath = path.join(botDir, '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
          const [key, ...value] = line.split('=');
          if (key) envObj[key] = value.join('=');
        });
      }

      const child = spawn('node', [mainFile], { cwd: botDir, stdio: 'inherit', env: { ...process.env, ...envObj } });
      runningBots[botId] = child;

      child.on('exit', (code) => {
        delete runningBots[botId];
      });

      child.on('error', (err) => {
        delete runningBots[botId];
      });

      // Update the embed
      const embed = new EmbedBuilder()
        .setTitle(`Settings for ${botId}`)
        .setDescription('Status: Running')
        .setColor(0x00ff00);

      const startButton = new ButtonBuilder()
        .setCustomId(`start_${botId}`)
        .setLabel('Start Bot')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

      const stopButton = new ButtonBuilder()
        .setCustomId(`stop_${botId}`)
        .setLabel('Stop Bot')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false);

      const row = new ActionRowBuilder().addComponents(startButton, stopButton);

      await interaction.update({ embeds: [embed], components: [row] });
    } else if (customId.startsWith('stop_')) {
      const botId = customId.slice(5);
      if (!hosted[interaction.user.id] || !hosted[interaction.user.id].includes(botId)) {
        return interaction.reply({ content: 'Bot not found.', ephemeral: true });
      }

      if (!runningBots[botId]) {
        return interaction.reply({ content: 'Bot is not running.', ephemeral: true });
      }

      runningBots[botId].kill('SIGKILL');
      delete runningBots[botId];

      // Update the embed
      const embed = new EmbedBuilder()
        .setTitle(`Settings for ${botId}`)
        .setDescription('Status: Stopped')
        .setColor(0xff0000);

      const startButton = new ButtonBuilder()
        .setCustomId(`start_${botId}`)
        .setLabel('Start Bot')
        .setStyle(ButtonStyle.Success)
        .setDisabled(false);

      const stopButton = new ButtonBuilder()
        .setCustomId(`stop_${botId}`)
        .setLabel('Stop Bot')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

      const row = new ActionRowBuilder().addComponents(startButton, stopButton);

      await interaction.update({ embeds: [embed], components: [row] });
    } else if (interaction.customId === 'done_vars') {
      // Proceed with hosting
      const data = userEnvVars[interaction.user.id];
      if (!data) return interaction.reply({ content: 'No data found.', ephemeral: true });

      await interaction.deferUpdate();

      const discordToken = data.vars.find(v => v.name === 'DISCORD_TOKEN')?.value;
      await hostBot(interaction, data.repo, data.vars, discordToken);

      delete userEnvVars[interaction.user.id];
    } else if (interaction.customId === 'add_var') {
      const modal = new ModalBuilder()
        .setCustomId('var_modal')
        .setTitle('Add Environment Variable');

      const nameInput = new TextInputBuilder()
        .setCustomId('var_name')
        .setLabel('Variable Name')
        .setStyle(1) // TextInputStyle.Short
        .setRequired(true);

      const valueInput = new TextInputBuilder()
        .setCustomId('var_value')
        .setLabel('Variable Value')
        .setStyle(1)
        .setRequired(true);

      const firstRow = new ActionRowBuilder().addComponents(nameInput);
      const secondRow = new ActionRowBuilder().addComponents(valueInput);

      modal.addComponents(firstRow, secondRow);

      await interaction.showModal(modal);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'var_modal') {
      const name = interaction.fields.getTextInputValue('var_name');
      const value = interaction.fields.getTextInputValue('var_value');

      const data = userEnvVars[interaction.user.id];
      if (data) {
        data.vars.push({ name, value });

        const varsList = data.vars.map(v => `${v.name}: ${v.value}`).join('\n');

        const embed = new EmbedBuilder()
          .setTitle('Add Environment Variables')
          .setDescription(`Click the button below to add more environment variables.\n\n**Added Variables:**\n${varsList}`)
          .setColor(0x0099ff);

        const addButton = new ButtonBuilder()
          .setCustomId('add_var')
          .setLabel('Add Variable')
          .setStyle(ButtonStyle.Primary);

        const doneButton = new ButtonBuilder()
          .setCustomId('done_vars')
          .setLabel('Done - Start Hosting')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(addButton, doneButton);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'manage_bot') {
      await interaction.deferReply({ ephemeral: true });

      const value = interaction.values[0];
      const [action, botId] = value.split('_');

      if (action === 'delete') {
        if (hosted[user.id] && hosted[user.id].includes(botId)) {
          hosted[user.id] = hosted[user.id].filter(id => id !== botId);
          saveData(HOSTED_FILE, hosted);

          // Kill the running bot if exists
          if (runningBots[botId]) {
            runningBots[botId].kill('SIGKILL'); // Force kill
            delete runningBots[botId];
          }

          // Wait a bit for process to die
          await new Promise(resolve => setTimeout(resolve, 1000));

          const botDir = path.join(__dirname, 'hosted_bots', botId);
          try {
            if (fs.existsSync(botDir)) {
              fs.rmSync(botDir, { recursive: true, force: true });
            }
            await interaction.editReply({ content: `Deleted bot ${botId}` });
          } catch (err) {
            console.error(`Failed to delete ${botDir}:`, err);
            await interaction.editReply({ content: `Bot ${botId} removed from list, but files may remain.` });
          }
        }
      } else if (action === 'settings') {
        if (!hosted[interaction.user.id] || !hosted[interaction.user.id].includes(botId)) {
          return interaction.editReply({ content: 'Bot not found.' });
        }

        const isRunning = !!runningBots[botId];

        const embed = new EmbedBuilder()
          .setTitle(`Settings for ${botId}`)
          .setDescription(`Status: ${isRunning ? 'Running' : 'Stopped'}`)
          .setColor(isRunning ? 0x00ff00 : 0xff0000);

        const startButton = new ButtonBuilder()
          .setCustomId(`start_${botId}`)
          .setLabel('Start Bot')
          .setStyle(ButtonStyle.Success)
          .setDisabled(isRunning);

        const stopButton = new ButtonBuilder()
          .setCustomId(`stop_${botId}`)
          .setLabel('Stop Bot')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!isRunning);

        const row = new ActionRowBuilder().addComponents(startButton, stopButton);

        await interaction.editReply({ embeds: [embed], components: [row] });
      }
    }
    return;
  } else if (interaction.isButton()) {
    if (interaction.customId === 'add_var') {
      const modal = new ModalBuilder()
        .setCustomId('var_modal')
        .setTitle('Add Environment Variable');

      const nameInput = new TextInputBuilder()
        .setCustomId('var_name')
        .setLabel('Variable Name')
        .setStyle(1) // TextInputStyle.Short
        .setPlaceholder('e.g., DISCORD_TOKEN')
        .setRequired(true);

      const valueInput = new TextInputBuilder()
        .setCustomId('var_value')
        .setLabel('Variable Value')
        .setStyle(1) // TextInputStyle.Short
        .setPlaceholder('e.g., your_token_here')
        .setRequired(true);

      const firstRow = new ActionRowBuilder().addComponents(nameInput);
      const secondRow = new ActionRowBuilder().addComponents(valueInput);

      modal.addComponents(firstRow, secondRow);

      await interaction.showModal(modal);
    } else if (interaction.customId === 'done_vars') {
      const data = userEnvVars[interaction.user.id];
      if (data) {
        await interaction.deferReply({ ephemeral: true });
        await hostBot(interaction, data.repo, data.vars, null);
        delete userEnvVars[interaction.user.id];
      }
    } else if (interaction.customId.startsWith('start_')) {
      const botId = interaction.customId.slice(6);
      if (hosted[interaction.user.id] && hosted[interaction.user.id].includes(botId)) {
        if (!runningBots[botId]) {
          const botDir = path.join(__dirname, 'hosted_bots', botId);
          const packageJsonPath = path.join(botDir, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            try {
              const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
              const mainFile = packageJson.main || 'index.js';
              const mainPath = path.join(botDir, mainFile);
              if (fs.existsSync(mainPath)) {
                const child = spawn('node', [mainFile], { cwd: botDir, stdio: 'inherit' });
                runningBots[botId] = child;
                child.on('exit', () => delete runningBots[botId]);
                child.on('error', () => delete runningBots[botId]);
                await interaction.reply({ content: `Started bot ${botId}.`, ephemeral: true });
              } else {
                await interaction.reply({ content: `Main file not found for ${botId}.`, ephemeral: true });
              }
            } catch (err) {
              await interaction.reply({ content: `Error starting bot ${botId}: ${err.message}`, ephemeral: true });
            }
          } else {
            await interaction.reply({ content: `No package.json found for ${botId}.`, ephemeral: true });
          }
        } else {
          await interaction.reply({ content: `Bot ${botId} is already running.`, ephemeral: true });
        }
      } else {
        await interaction.reply({ content: 'Bot not found.', ephemeral: true });
      }
    } else if (interaction.customId.startsWith('stop_')) {
      const botId = interaction.customId.slice(5);
      if (runningBots[botId]) {
        runningBots[botId].kill('SIGKILL');
        delete runningBots[botId];
        await interaction.reply({ content: `Stopped bot ${botId}.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `Bot ${botId} is not running.`, ephemeral: true });
      }
    }
    return;
  }

  if (commandName === 'host') {
    const isPremium = premiumUsers.includes(user.id);
    const userUsage = usage[user.id] || 0;

    if (!isPremium && userUsage >= 1) {
      return interaction.reply({ content: 'You have reached the limit of 1 host. Upgrade to premium for unlimited hosts.', ephemeral: true });
    }

    const attachment = interaction.options.getAttachment('zipfile');
    const githubRepo = interaction.options.getString('github_repo');
    // Removed discord_token and env_vars options

    if (!attachment && !githubRepo) {
      return interaction.reply({ content: 'Please provide either a zip file or a GitHub repository URL.', ephemeral: true });
    }

    if (attachment && githubRepo) {
      return interaction.reply({ content: 'Please provide either a zip file OR a GitHub repository URL, not both.', ephemeral: true });
    }

    if (githubRepo) {
      // Interactive GitHub hosting
      userEnvVars[user.id] = { repo: githubRepo, vars: [] };

      const embed = new EmbedBuilder()
        .setTitle('Add Environment Variables')
        .setDescription('Click the button below to add environment variables for your bot.\n\n**Added Variables:**\nNone yet')
        .setColor(0x0099ff);

      const addButton = new ButtonBuilder()
        .setCustomId('add_var')
        .setLabel('Add Variable')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(addButton);

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('Hosting Your Bot')
      .setDescription('Initializing...')
      .setColor(0x0099ff);

    await interaction.editReply({ embeds: [embed] });

    let lastPercent = 0;

    // Download the zip file
    try {
      if (attachment) {
        // Zip file method
        embed.setDescription('Downloading zip file...');
        await interaction.editReply({ embeds: [embed] });

        let lastPercent = 0;
        const response = await axios.get(attachment.url, {
          responseType: 'arraybuffer',
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
              if (percent > lastPercent) {
                lastPercent = percent;
                const progressBar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
                embed.setDescription(`Downloading zip file...\n${percent}% complete\n${progressBar}`);
                interaction.editReply({ embeds: [embed] }).catch(() => {});
              }
            }
          }
        });
        const zipBuffer = Buffer.from(response.data);

        embed.setDescription('Extracting zip file...');
        await interaction.editReply({ embeds: [embed] });

        const baseName = attachment.name.replace(/\.zip$/i, '');
        botName = baseName;
        let counter = 1;
        while (hosted[user.id] && hosted[user.id].includes(botName)) {
          botName = `${baseName}_${counter}`;
          counter++;
        }
        botDir = path.join(__dirname, 'hosted_bots', botName);
        if (!fs.existsSync(path.join(__dirname, 'hosted_bots'))) {
          fs.mkdirSync(path.join(__dirname, 'hosted_bots'));
        }
        if (!fs.existsSync(botDir)) {
          fs.mkdirSync(botDir);
        }

        const zip = new AdmZip(zipBuffer);
        zip.extractAllTo(botDir, true);
      } else {
        // GitHub method
        embed.setDescription('Cloning GitHub repository...');
        await interaction.editReply({ embeds: [embed] });

        const repoName = githubRepo.split('/').pop().replace('.git', '');
        botName = repoName;
        let counter = 1;
        while (hosted[user.id] && hosted[user.id].includes(botName)) {
          botName = `${repoName}_${counter}`;
          counter++;
        }
        botDir = path.join(__dirname, 'hosted_bots', botName);
        if (!fs.existsSync(path.join(__dirname, 'hosted_bots'))) {
          fs.mkdirSync(path.join(__dirname, 'hosted_bots'));
        }

        await new Promise((resolve, reject) => {
          exec(`git clone ${githubRepo} "${botDir}"`, (error, stdout, stderr) => {
            if (error) {
              console.error(`Git clone error:`, error);
              reject(new Error('Failed to clone repository'));
            } else {
              console.log(`Git clone success`);
              resolve();
            }
          });
        });
      }

      // No longer setting up custom environment variables

      // Try to run the bot if it's a Node.js project
      const packageJsonPath = path.join(botDir, 'package.json');
      let started = false;
      let reason = '';
      if (fs.existsSync(packageJsonPath)) {
        embed.setDescription('Found package.json. Checking for main file...');
        await interaction.editReply({ embeds: [embed] });

        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          const mainFile = packageJson.main || 'index.js';
          const mainPath = path.join(botDir, mainFile);

          if (fs.existsSync(mainPath)) {
            embed.setDescription('Installing dependencies...');
            await interaction.editReply({ embeds: [embed] });

            // Install dependencies
            await new Promise((resolve, reject) => {
              exec('npm install', { cwd: botDir }, (error, stdout, stderr) => {
                if (error) {
                  console.error(`npm install error for ${botName}:`, error);
                  reject(new Error('Failed to install dependencies'));
                } else {
                  console.log(`npm install success for ${botName}`);
                  resolve();
                }
              });
            });

            embed.setDescription('Starting bot...');
            await interaction.editReply({ embeds: [embed] });

            // Start the bot
            const child = spawn('node', [mainFile], { cwd: botDir, stdio: 'inherit', env: { ...process.env } });
            runningBots[botName] = child;

            child.on('exit', (code) => {
              console.log(`Bot ${botName} exited with code ${code}`);
              delete runningBots[botName];
            });

            child.on('error', (err) => {
              console.error(`Bot ${botName} error:`, err);
              delete runningBots[botName];
            });

            started = true;
          } else {
            reason = `Main file '${mainFile}' not found. Make sure your package.json specifies the correct main file.`;
            console.log(`Main file ${mainFile} not found for ${botName}`);
          }
        } catch (err) {
          reason = `Error starting bot: ${err.message}`;
          console.error(`Error starting bot ${botName}:`, err);
        }
      } else {
        reason = `No package.json found. To host a Node.js Discord bot, include a package.json file with your dependencies and main script.`;
        console.log(`No package.json found for ${botName}`);
      }

      // Add to hosted
      if (!hosted[user.id]) hosted[user.id] = [];
      hosted[user.id].push(botName);
      saveData(HOSTED_FILE, hosted);

      // Increment usage
      usage[user.id] = (usage[user.id] || 0) + 1;
      saveData(USAGE_FILE, usage);

      const status = started ? '✅ Successfully hosted and started!' : `⚠️ Hosted but could not be started.\n${reason}`;
      embed.setDescription(status)
        .setTitle(`Bot Hosted: ${botName}`)
        .setColor(started ? 0x00ff00 : 0xffa500);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      embed.setDescription('❌ Failed to host the bot. Please try again.')
        .setColor(0xff0000);
      await interaction.editReply({ embeds: [embed] });
    }
  } else if (commandName === 'hosted') {
    const userHosted = hosted[user.id] || [];
    if (userHosted.length === 0) {
      return interaction.reply({ content: 'You have no hosted bots.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('Your Hosted Bots')
      .setDescription(userHosted.map(id => `- ${id} ${runningBots[id] ? '(Running)' : '(Stopped)'}`).join('\n'));

    const options = userHosted.map(id => [
      { label: `Delete ${id}`, value: `delete_${id}` },
      { label: `Settings ${id}`, value: `settings_${id}` }
    ]).flat();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('manage_bot')
      .setPlaceholder('Select an action')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } else if (commandName === 'premium') {
    const isPremium = premiumUsers.includes(user.id);
    await interaction.reply({ content: `You are ${isPremium ? '' : 'not '}a premium user.`, ephemeral: true });
  } else if (commandName === 'addpremium') {
    if (user.id !== '1045370637776064612') {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    if (!premiumUsers.includes(targetUser.id)) {
      premiumUsers.push(targetUser.id);
      saveData(PREMIUM_FILE, premiumUsers);
      await interaction.reply({ content: `Added ${targetUser.username} to premium users.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `${targetUser.username} is already premium.`, ephemeral: true });
    }
  }
});

client.login(TOKEN);