// Handles !rename and /add-user commands
const { PermissionFlagsBits } = require('discord.js');
const { TICKET_CATEGORIES, logTicketAction } = require('./ticketManager');

async function handleRename(message, args) {
  if (!message.channel.parentId || !Object.values(TICKET_CATEGORIES).some(cat => cat.id === message.channel.parentId)) return;
  const newName = args.join(' ').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 90) || 'ticket';
  await message.channel.setName(newName);
  await message.reply(`Channel renamed to ${newName}`);
  logTicketAction(message.client, `Ticket renamed to ${newName} by <@${message.author.id}> in ${message.channel}`);
}

async function handleAddUser(interaction) {
  const channel = interaction.channel;
  const user = interaction.options.getUser('user');
  if (!channel.parentId || !Object.values(TICKET_CATEGORIES).some(cat => cat.id === channel.parentId)) return interaction.reply({ content: 'Not a ticket channel.', ephemeral: true });
  await channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
  });
  await interaction.reply({ content: `Added <@${user.id}> to the ticket.`, ephemeral: false });
  logTicketAction(interaction.client, `User <@${user.id}> added to ticket by <@${interaction.user.id}> in ${channel}`);
}

module.exports = {
  handleRename,
  handleAddUser,
};
