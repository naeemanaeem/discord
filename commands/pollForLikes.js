import {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';

import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const POLL_FILE = join(__dirname, '../polls.json');

// Utilities
function summarizeTo20Words(text) {
  return text.split(/\s+/).slice(0, 20).join(' ') + '...';
}

function generateVoteBar(votes, total, length = 20) {
  if (total === 0) return '░'.repeat(length);
  const filledLength = Math.round((votes / total) * length);
  return '█'.repeat(filledLength) + '░'.repeat(length - filledLength);
}

// Slash command definition
export const data = new SlashCommandBuilder()
  .setName('poll-from-likes')
  .setDescription('Create a poll from top liked messages')
  .addIntegerOption(option =>
    option
      .setName('count')
      .setDescription('How many top messages to include')
      .setMinValue(1)
      .setMaxValue(10)
  )
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to pull liked messages from')
  );

// Main execution
export async function execute(interaction) {
  const count = interaction.options.getInteger('count') || 5;
  const targetChannel =
    interaction.options.getChannel('channel') || interaction.channel;

  if (!targetChannel.viewable) {
    return interaction.reply('❌ I do not have access to that channel.');
  }

  await interaction.deferReply();

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const messages = await targetChannel.messages.fetch({ limit: 100 });

  const positiveEmojis = ['👍', '❤️', '🔥', '💯'];

  const scoredMessages = messages
    .map(m => {
      const totalLikes = positiveEmojis.reduce((sum, emoji) => {
        return sum + (m.reactions.cache.get(emoji)?.count || 0);
      }, 0);
      return {
        content: m.content || '[No text content]',
        likes: totalLikes,
        timestamp: m.createdTimestamp,
        messageId: m.id,
      };
    })
    .filter(m => m.timestamp > sevenDaysAgo);

  const topMessages = scoredMessages
    .sort((a, b) => b.likes - a.likes)
    .slice(0, count);

  if (topMessages.length === 0) {
    return interaction.editReply('❌ No liked messages found from the past 7 days.');
  }

  const alphabetEmojis = [...'🇦🇧🇨🇩🇪🇫🇬🇭🇮🇯🇰'];

  const pollOptions = topMessages.map((m, i) => {
    const words = m.content.split(/\s+/);
    return {
      label: words.slice(0, 50).join(' '),
      emoji: alphabetEmojis[i],
      fullContent: m.content,
      likes: m.likes,
      messageId: m.messageId,
      isTruncated: words.length > 50,
    };
  });

  // Send each poll option with link buttons if needed
  for (const opt of pollOptions) {
    const content = `${opt.emoji} (${opt.likes} likes)\n${opt.label}`;
    const components = [];

    if (opt.isTruncated) {
      const url = `https://discord.com/channels/${interaction.guildId}/${targetChannel.id}/${opt.messageId}`;
      const button = new ButtonBuilder()
        .setLabel(`View Full Message`)
        .setStyle(ButtonStyle.Link)
        .setURL(url);
      components.push(new ActionRowBuilder().addComponents(button));
    }

    await interaction.followUp({ content, components, ephemeral: false });
  }

  // Create the actual poll message
  let pollBody = `📊 **Vote using reactions below:**\n\n`;
  const maxVotes = Math.max(...pollOptions.map(opt => opt.likes));

  for (const opt of pollOptions) {
    const bar = generateVoteBar(opt.likes, maxVotes);
    pollBody += `${opt.emoji} ${bar} (${opt.likes} votes)\n`;
  }

  const pollMessage = await interaction.followUp({
    content: pollBody,
    ephemeral: false,
  });

  // Add reactions
  for (const opt of pollOptions) {
    try {
      await pollMessage.react(opt.emoji);
    } catch (err) {
      console.warn(`❗ Failed to react with ${opt.emoji}:`, err.message);
    }
  }

  // Persist poll metadata
  const polls = fs.existsSync(POLL_FILE)
    ? JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'))
    : {};
    polls[pollMessage.id] = {
      channelId: pollMessage.channel.id,
      messageId: pollMessage.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      options: pollOptions.map(opt => ({
        emoji: opt.emoji,
        label: opt.label,
        messageId: opt.messageId,
        votes: 0 // add default votes field
      }))
    };
    
  fs.writeFileSync(POLL_FILE, JSON.stringify(polls, null, 2));

  // Start live poll updates
  startPollLiveUpdates(pollMessage, pollOptions);
}

// Live update handler
function startPollLiveUpdates(pollMessage, pollOptions) {
  const interval = setInterval(async () => {
    try {
      const fetched = await pollMessage.channel.messages.fetch(pollMessage.id);

      const reactionCounts = await Promise.all(
        pollOptions.map(async opt => {
          const reaction = fetched.reactions.cache.get(opt.emoji);
          const users = await reaction?.users.fetch();
          return users ? users.filter(u => !u.bot).size : 0;
        })
      );

      const totalVotes = reactionCounts.reduce((a, b) => a + b, 0);
      let updatedContent = `📊 **Live Poll Results:**\n\n`;

      for (let i = 0; i < pollOptions.length; i++) {
        const opt = pollOptions[i];
        const votes = reactionCounts[i];
        const bar = generateVoteBar(votes, totalVotes);
        const label = opt.label.length > 80
          ? opt.label.slice(0, 80) + '…'
          : opt.label;
        updatedContent += `${opt.emoji} ${label}\n${bar} ${votes} vote${votes !== 1 ? 's' : ''}\n\n`;
      }

      if (updatedContent.length > 2000) {
        updatedContent = updatedContent.slice(0, 1995) + '…';
      }

      await fetched.edit(updatedContent);
    } catch (err) {
      console.error('❌ Poll update error:', err.message);
      clearInterval(interval);
    }
  }, 10000); // update every 10s
}
