import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('pinlast')
  .setDescription('Pin the most recent user message in the channel');

export async function execute(interaction) {
  const channel = interaction.channel;
  const msgs = await channel.messages.fetch({ limit: 10 });
  const lastUserMsg = msgs.find(m => !m.author.bot);

  if (lastUserMsg) {
    await lastUserMsg.pin();
    await interaction.reply(`📌 Pinned: "${lastUserMsg.content}"`);
  } else {
    await interaction.reply('❌ No user messages found to pin.');
  }
}
