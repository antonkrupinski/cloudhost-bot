// Handles ticket creation, claim, close, and logging
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TICKET_CATEGORIES = {
  general: { id: '1455034546918654189', staffRole: '1455034397987176528', additionalRole: '1455034439737544776', label: 'General' },
  internal: { id: '1455034548294516970', staffRole: '1455034419030266004', label: 'Internal Affairs' },
  management: { id: '1455034549720322249', staffRole: '1455034415779549204', label: 'Management' },
};
const LOG_CHANNEL_ID = '1455034597288181874';

async function logTicketAction(client, message) {
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (logChannel) logChannel.send({ content: message });
}

async function postTicketEmbed(client) {
  const channel = await client.channels.fetch('1455034559866601585');
  if (!channel) return;
    // Image embed above ticket embed
    const imageEmbed = new EmbedBuilder()
      .setImage('https://images-ext-1.discordapp.net/external/gmfslOfP72UdbY_184UXPIxgf5tnUzm5acEVidU1lgs/https/s3.galaxybot.app/server/1424933331426086994/531e60ce-f5dc-4dc2-a91c-b96ea065428d.jpeg?format=webp')
      .setColor(0xbdb7b7);
    const emoji = client.emojis.cache.get('1455039396268212367');
    const emojiStr = emoji ? emoji.toString() : '❓';
    // Ticket embed
    const embed = new EmbedBuilder()
      .setTitle('Utah Assistance')
      .setDescription('Here is the Assistance panel for ***Utah State Roleplay***. This is where you can find the relevant ticket choice and what each one handles. Please choose the right ticket type that suits your needs.')
      .setImage('https://media.discordapp.net/attachments/1430332755673223232/1454570533474537602/clintonfooter.jpg?ex=6952e35f&is=695191df&hm=d46f29a82e97cdecbaf940e09e7b2adee2c762f313394c76a488bf6e4aceea78&=&format=webp&width=1872&height=94')
      .setColor(0xbdb7b7)
      .setFooter({ text: '© 2025 Utah State Roleplay, all rights reserved.' })
      .setFields(
        { name: `${emojiStr} General`, value: ' - Questions\n - Concerns\n - Game Reports', inline: true },
        { name: `${emojiStr} Internal Affairs`, value: ' - Staff Reports\n - Member Reports\n - Serious Concerns', inline: true },
        { name: `${emojiStr} Management`, value: ' - Claiming Ranks\n - Affiliations\n - High Rank Support', inline: true },
      );
    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_category')
      .setPlaceholder('Choose a category...')
      .addOptions([
        { label: 'General', value: 'general', description: 'General support' },
        { label: 'Internal Affairs', value: 'internal', description: 'Internal Affairs issues' },
        { label: 'Management', value: 'management', description: 'Management requests' },
      ]);
    const row = new ActionRowBuilder().addComponents(select);
    await channel.send({ embeds: [imageEmbed, embed], components: [row] });
}

async function handleCategorySelect(interaction) {
  const category = TICKET_CATEGORIES[interaction.values[0]];
  if (!category) return;
  const guild = interaction.guild;
  const user = interaction.user;
  // Create channel
  const channel = await guild.channels.create({
    name: `ticket-${user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: category.staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(category.additionalRole ? [{ id: category.additionalRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ],
  });
  // Ticket controls
  const actionSelect = new StringSelectMenuBuilder()
    .setCustomId('ticket_action')
    .setPlaceholder('Choose an action...')
    .addOptions([
      { label: 'Claim Ticket', value: 'claim', description: 'Claim this ticket to assist the user' },
      { label: 'Close Ticket', value: 'close', description: 'Close the ticket and log the conversation' },
    ]);
  const row = new ActionRowBuilder().addComponents(actionSelect);
  const ping = `<@${user.id}> <@&${category.staffRole}>${category.additionalRole ? ` <@&${category.additionalRole}>` : ''}`;
  const imageEmbed = new EmbedBuilder()
    .setImage('https://images-ext-1.discordapp.net/external/gmfslOfP72UdbY_184UXPIxgf5tnUzm5acEVidU1lgs/https/s3.galaxybot.app/server/1424933331426086994/531e60ce-f5dc-4dc2-a91c-b96ea065428d.jpeg?format=webp')
    .setColor(0xbdb7b7);
  const ticketEmbed = new EmbedBuilder()
    .setTitle('Welcome to your ticket!')
    .setDescription('Your ticket has been created. A staff member will be with you shortly.\n\n**Ticket Controls:**\n- **Claim:** Staff can claim the ticket to indicate they are assisting you.\n- **Close:** Closes the ticket and logs the conversation.')
    .setColor(0xbdb7b7)
    .setFooter({ text: '© 2025 Utah State Roleplay, all rights reserved.' })
    .setImage('https://media.discordapp.net/attachments/1430332755673223232/1454570533474537602/clintonfooter.jpg?ex=6952e35f&is=695191df&hm=d46f29a82e97cdecbaf940e09e7b2adee2c762f313394c76a488bf6e4aceea78&=&format=webp&width=1872&height=94');
  await channel.send({ content: ping, embeds: [imageEmbed, ticketEmbed], components: [row] });
  await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  logTicketAction(interaction.client, `Ticket opened by <@${user.id}> in ${channel}`);
}

async function handleClaim(interaction) {
  const member = interaction.member;
  const channel = interaction.channel;
  // Only staff can claim, only one claim
  const category = Object.values(TICKET_CATEGORIES).find(cat => channel.parentId === cat.id);
  if (!category || (!member.roles.cache.has(category.staffRole) && !(category.additionalRole && member.roles.cache.has(category.additionalRole)))) return interaction.reply({ content: 'You are not allowed to claim this ticket.', ephemeral: true });
  if (channel.topic && channel.topic.startsWith('Claimed:')) return interaction.reply({ content: 'This ticket is already claimed.', ephemeral: true });
  await channel.setTopic(`Claimed: ${member.id}`);
  await interaction.reply({ content: `Ticket claimed by <@${member.id}>`, ephemeral: false });
  logTicketAction(interaction.client, `Ticket claimed by <@${member.id}> in ${channel}`);
  // Update the select menu to unclaim
  const messages = await channel.messages.fetch({ limit: 10 });
  const ticketMessage = messages.find(msg => msg.components && msg.components.length > 0);
  if (ticketMessage) {
    const newSelect = new StringSelectMenuBuilder()
      .setCustomId('ticket_action')
      .setPlaceholder('Choose an action...')
      .addOptions([
        { label: 'Unclaim Ticket', value: 'unclaim', description: 'Unclaim this ticket' },
        { label: 'Close Ticket', value: 'close', description: 'Close the ticket and log the conversation' },
      ]);
    const newRow = new ActionRowBuilder().addComponents(newSelect);
    await ticketMessage.edit({ components: [newRow] });
  }
}

async function handleClose(interaction) {
  const channel = interaction.channel;
  await interaction.deferReply({ ephemeral: false });
  await interaction.editReply({ content: 'Ticket will be closed in 5 seconds.' });
  // Fetch all messages in the ticket channel
  let messages = [];
  try {
    let lastId;
    while (true) {
      const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
      if (fetched.size === 0) break;
      messages = messages.concat(Array.from(fetched.values()));
      lastId = fetched.last()?.id;
      if (fetched.size < 100) break;
    }
    messages = messages.reverse(); // oldest first
  } catch (e) {
    // ignore fetch errors
  }
  // Format messages for embed
  const logEmbeds = [];
  let currentEmbed = new EmbedBuilder().setTitle(`Ticket Log: #${channel.name}`).setColor(0x5865F2);
  let desc = '';
  for (const msg of messages) {
    const line = `**${msg.author?.tag || msg.author?.username || 'Unknown'}:** ${msg.content || '[Embed/Attachment]'}\n`;
    if ((desc + line).length > 4000) {
      currentEmbed.setDescription(desc);
      logEmbeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder().setColor(0x5865F2);
      desc = '';
    }
    desc += line;
  }
  if (desc) {
    currentEmbed.setDescription(desc);
    logEmbeds.push(currentEmbed);
  }
  // Send embeds to log channel
  const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (logChannel) {
    for (const embed of logEmbeds) {
      await logChannel.send({ embeds: [embed] });
    }
  }
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

async function handleUnclaim(interaction) {
  const member = interaction.member;
  const channel = interaction.channel;
  const category = Object.values(TICKET_CATEGORIES).find(cat => channel.parentId === cat.id);
  if (!category || (!member.roles.cache.has(category.staffRole) && !(category.additionalRole && member.roles.cache.has(category.additionalRole)))) return interaction.reply({ content: 'You are not allowed to unclaim this ticket.', ephemeral: true });
  if (!channel.topic || !channel.topic.startsWith('Claimed:')) return interaction.reply({ content: 'This ticket is not claimed.', ephemeral: true });
  const claimerId = channel.topic.split(': ')[1];
  if (claimerId !== member.id) return interaction.reply({ content: 'Only the staff member who claimed this ticket can unclaim it.', ephemeral: true });
  await channel.setTopic('');
  await interaction.reply({ content: `Ticket unclaimed by <@${member.id}>`, ephemeral: false });
  logTicketAction(interaction.client, `Ticket unclaimed by <@${member.id}> in ${channel}`);
  // Update the select menu back to claim
  const messages = await channel.messages.fetch({ limit: 10 });
  const ticketMessage = messages.find(msg => msg.components && msg.components.length > 0);
  if (ticketMessage) {
    const newSelect = new StringSelectMenuBuilder()
      .setCustomId('ticket_action')
      .setPlaceholder('Choose an action...')
      .addOptions([
        { label: 'Claim Ticket', value: 'claim', description: 'Claim this ticket to assist the user' },
        { label: 'Close Ticket', value: 'close', description: 'Close the ticket and log the conversation' },
      ]);
    const newRow = new ActionRowBuilder().addComponents(newSelect);
    await ticketMessage.edit({ components: [newRow] });
  }
}

async function handleActionSelect(interaction) {
  const action = interaction.values[0];
  if (action === 'claim') {
    await handleClaim(interaction);
  } else if (action === 'unclaim') {
    await handleUnclaim(interaction);
  } else if (action === 'close') {
    await handleClose(interaction);
  }
}

module.exports = {
  postTicketEmbed,
  handleCategorySelect,
  handleClaim,
  handleClose,
  handleActionSelect,
  logTicketAction,
  TICKET_CATEGORIES,
};
