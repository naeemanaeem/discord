import { SlashCommandBuilder } from 'discord.js';
import { queryOllama } from '../utils/OllamaClient.js';

export const data = new SlashCommandBuilder()
  .setName('summarize')
  .setDescription('Summarize recent messages in the channel');

export async function execute(interaction) {
  await interaction.deferReply();

  const channel = interaction.channel;
  const messages = await channel.messages.fetch({ limit: 100 });

  const content = messages
    .filter(m => !m.author.bot && m.content.trim())
    .map(m => `${m.author.username}: ${m.content}`)
    .reverse()
    .join('\n')
    .slice(-4000);

  if (!content.trim()) {
    return await interaction.editReply("⚠️ Not enough user messages to summarize.");
  }

  try {
    const res = await queryOllama({ prompt: content });
    if (res.status !== 200) {
      return interaction.editReply('❌ Error: ' + res.statusText);
    }

    const summary = res.data.response || '⚠️ No summary generated.';
    await interaction.editReply(`📝 ${summary}`);
  } catch (err) {
    console.error('❌ Summarize command failed:', err.message);
    await interaction.editReply('❌ Could not summarize the messages.');
  }
}
