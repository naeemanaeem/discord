// commands/rsvpManager.js
import { EmbedBuilder } from 'discord.js';

// messageId → { going: Set<userId>, notGoing: Set<userId> }
const rsvps = new Map();

export function initRsvpFor(messageId) {
  rsvps.set(messageId, { going: new Set(), notGoing: new Set() });
}

export function handleRsvpReaction(reaction, user) {
  if (user.bot) return;
  const state = rsvps.get(reaction.message.id);
  if (!state) return;

  if (reaction.emoji.name === '✅') {
    state.going.add(user.id);
    state.notGoing.delete(user.id);
  }
  if (reaction.emoji.name === '❌') {
    state.notGoing.add(user.id);
    state.going.delete(user.id);
  }

  updateRsvpEmbed(reaction.message, state);
}

async function updateRsvpEmbed(message, state) {
  const goingUsers    = [...state.going].map(id => `<@${id}>`).join(', ')  || '—';
  const notGoingUsers = [...state.notGoing].map(id => `<@${id}>`).join(', ') || '—';

  // Start from the original embed (it’s an array)
  const original = message.embeds[0];
  const embed = EmbedBuilder.from(original)
    // remove any existing RSVP fields:
    .setFields([
      { name: '✅ Going',     value: goingUsers,    inline: false },
      { name: '❌ Not going', value: notGoingUsers, inline: false }
    ]);

  await message.edit({ embeds: [embed] });
}
