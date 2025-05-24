// app.js
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

// Calendar commands
import { createEvent, listEvents, updateEvent, deleteEvent } from './commands/calendar.js';

// Poll‐from‐likes & poll‐results
import * as pollForLikes from './commands/pollForLikes.js';
import { pollResults } from './commands/pollResults.js';

// LLM utilities
import * as ask from './commands/ask.js';
import * as summarize from './commands/summarize.js';
import * as stats from './commands/stats.js';
import * as modcheck from './commands/modcheck.js';
import * as pinlast from './commands/pinlast.js';

// Announce + RSVP
import {
  data    as announceData,
  execute as announceExecute,
  handleAnnouncementReaction
} from './commands/announce-event.js';

// Live‐poll resume
import { resumeAllLivePolls } from './commands/pollManager.js';

dotenv.config();

// 1️⃣ Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessageReactions, // needed for rsvp reactions
  ]
});

// 2️⃣ Collect your commands
client.commands = new Collection();
const commands = [
  createEvent,
  listEvents,
  updateEvent,
  deleteEvent,
  pollForLikes,
  pollResults,
  ask,
  summarize,
  stats,
  modcheck,
  pinlast,
  { data: announceData, execute: announceExecute },
];

for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

// 3️⃣ Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
async function registerSlashCommands() {
  try {
    console.log('🔁 Registering slash commands in guild...');
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID     // ← your test server’s ID
      ),
      { body: commands.map(cmd => cmd.data.toJSON()) }
    );
    console.log('✅ Slash commands registered in guild.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
}

// 4️⃣ Handle slash‐command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) {
    return interaction.reply({ content: '❓ Unknown command', ephemeral: false });
  }

  try {
    // If it’s announce-event, we need to capture its returned messageId
    if (interaction.commandName === 'announce-event') {
      const messageId = await announceExecute(interaction);
      // announceExecute should have returned the sent message’s ID
      // no further action here—RSVP manager will track it
    } else {
      await cmd.execute(interaction);
    }
  } catch (err) {
    console.error(`❌ Error executing ${interaction.commandName}:`, err);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: '⚠️ Something went wrong!' });
    } else {
      await interaction.reply({ content: '⚠️ Something went wrong!', ephemeral: false });
    }
  }
});

// 5️⃣ Forward reaction adds/removes for RSVP
client.on('messageReactionAdd',    (reaction, user) => handleAnnouncementReaction(reaction, user));
client.on('messageReactionRemove', (reaction, user) => handleAnnouncementReaction(reaction, user));

// 6️⃣ Ready → resume live polls
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  resumeAllLivePolls(client);
});

// 7️⃣ Boot
registerSlashCommands();
client.login(process.env.DISCORD_TOKEN);
