import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('modcheck')
  .setDescription('Check if you are a moderator');

export async function execute(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isMod = member.permissions.has(PermissionsBitField.Flags.ManageMessages);
  await interaction.reply(isMod ? '🛡️ You are a moderator!' : '🚫 You are not a moderator.');
}
