// pollResults.js
import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POLL_FILE = join(__dirname, '../polls.json');

export const pollResults = {
  data: new SlashCommandBuilder()
    .setName('poll-results')
    .setDescription('Show results of the latest poll in this channel'),

  async execute(interaction) {
    await interaction.deferReply();

    const polls = fs.existsSync(POLL_FILE)
      ? JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'))
      : {};

    // Find latest poll in this channel
    const poll = Object.values(polls)
      .filter(p => p.channelId === interaction.channel.id)
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];

    if (!poll) {
      return interaction.editReply('❌ No poll found in this channel.');
    }

    const channel = await interaction.client.channels.fetch(poll.channelId);
    const pollMsg = await channel.messages.fetch(poll.messageId);
    const reactions = pollMsg.reactions.cache;

    let resultsText = `📊 **Poll Results:**\n`;

    for (const option of poll.options) {
      // Subtract 1 to exclude the bot's own reaction
      const count = (reactions.get(option.emoji)?.count ?? 1) - 1;
      resultsText += `${option.emoji} ${option.label} — **${count}** votes\n`;
    }

    await interaction.editReply(resultsText);
  },
};
