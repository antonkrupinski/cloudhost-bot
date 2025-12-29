// Registers the /add-user slash command
const { SlashCommandBuilder } = require('discord.js');

const data = [
  new SlashCommandBuilder()
    .setName('add-user')
    .setDescription('Add a user to your ticket')
    .addUserOption(option => option.setName('user').setDescription('User to add').setRequired(true)),
];

module.exports = { data };
