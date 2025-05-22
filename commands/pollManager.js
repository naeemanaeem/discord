import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const POLL_FILE = join(__dirname, '../polls.json');

const pollIntervals = new Map();

function loadPolls() {
  if (!fs.existsSync(POLL_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
  } catch (err) {
    console.error('❌ Failed to load polls.json:', err.message);
    return {};
  }
}

function savePolls(polls) {
  try {
    fs.writeFileSync(POLL_FILE, JSON.stringify(polls, null, 2));
  } catch (err) {
    console.error('❌ Failed to save polls.json:', err.message);
  }
}

function generateVoteBar(votes, total, length = 20) {
  const percentage = total > 0 ? votes / total : 0;
  const filled = Math.round(percentage * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function renderPollContent(options) {
  if (!options || !Array.isArray(options)) {
    return '⚠️ Poll data missing or corrupted.';
  }

  const totalVotes = options.reduce((sum, o) => sum + (o.votes || 0), 0);
  const maxVotes = Math.max(...options.map(o => o.votes || 0), 1);

  let content = `📊 **Live Poll Results:**\n\n`;

  for (const opt of options) {
    const bar = generateVoteBar(opt.votes || 0, totalVotes);
    const label = opt.label?.length > 80 ? opt.label.slice(0, 80) + '…' : opt.label;
    const votes = opt.votes || 0;
    content += `${opt.emoji} ${label}\n${bar} ${votes} vote${votes === 1 ? '' : 's'}\n\n`;
  }

  if (content.length > 2000) {
    content = content.slice(0, 1995) + '…';
  }

  return content;
}

export function startPollLiveUpdates(pollMessage, pollOptions) {
  const interval = setInterval(async () => {
    try {
      const fetched = await pollMessage.channel.messages.fetch(pollMessage.id);
      const reactionCounts = await Promise.all(
        pollOptions.map(async opt => {
          const reaction = fetched.reactions.cache.get(opt.emoji);
          const users = await reaction?.users.fetch();
          const count = users ? users.filter(u => !u.bot).size : 0;
          return count;
        })
      );

      // Update poll data in memory and file
      const polls = loadPolls();
      const poll = polls[pollMessage.id];
      if (poll) {
        for (let i = 0; i < reactionCounts.length; i++) {
          poll.options[i].votes = reactionCounts[i];
        }
        savePolls(polls);
      }

      // Render and update message
      const updatedContent = renderPollContent(poll?.options);
      await fetched.edit(updatedContent);
    } catch (err) {
      console.error(`❌ Error updating poll ${pollMessage.id}:`, err.message);
      clearInterval(interval);
      pollIntervals.delete(pollMessage.id);
    }
  }, 10_000);

  pollIntervals.set(pollMessage.id, interval);
}

export async function resumeAllLivePolls(client) {
  const polls = loadPolls();
  for (const [id, poll] of Object.entries(polls)) {
    if (poll.expiresAt < Date.now()) continue;

    try {
      let channel = client.channels.cache.get(poll.channelId);

      // If not cached, fetch it
      if (!channel) {
        channel = await client.channels.fetch(poll.channelId);
      }

      // Make sure it's a text channel with messages
      if (!channel?.isTextBased?.()) {
        console.warn(`⚠️ Channel ${poll.channelId} is not text-based`);
        continue;
      }

      const msg = await channel.messages.fetch(poll.messageId);
      startPollLiveUpdates(msg, poll.options);

    } catch (err) {
      console.warn(`⚠️ Could not resume poll ${id}:`, err.message);
    }
  }
}

