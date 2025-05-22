import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show server and user stats');

export async function execute(interaction) {
  const totalUsers = interaction.client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
  const serverCount = interaction.client.guilds.cache.size;

  await interaction.reply(`📊 I'm active in **${serverCount}** servers with **${totalUsers}** users!`);
}
