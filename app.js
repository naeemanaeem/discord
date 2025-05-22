// app.js
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { createEvent, listEvents, updateEvent, deleteEvent } from './commands/calendar.js';
import * as pollForLikes from './commands/pollForLikes.js';
import { pollResults } from './commands/pollResults.js';
import * as ask from './commands/ask.js';
import * as summarize from './commands/summarize.js';
import * as stats from './commands/stats.js';
import * as modcheck from './commands/modcheck.js';
import * as pinlast from './commands/pinlast.js';
//import { startPollUpdater } from './commands/pollManager.js';
//import { handleReactionUpdate } from './commands/pollManager.js';
import { resumeAllLivePolls } from './commands/pollManager.js';

/*import { MessageFlags } from 'discord.js';
import {
    activePolls,
    resumePendingPolls,
    tallyPollResults,
    savePollsToFile
  } from './commands/pollManager.js';*/
dotenv.config();

// Create client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load commands into a collection
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
  ];

  for (const command of commands) {
    console.log(command, command.data?.name);
    client.commands.set(command.data.name, command);
  }
  

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerSlashCommands() {
  try {
    console.log('🔁 Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.data.toJSON()) }
    );
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
}

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    return interaction.reply({
      content: '❓ Unknown command',
      ephemeral: true,
    });
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing ${interaction.commandName}:`, error);

    // Only reply if it hasn’t been already
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: '⚠️ Something went wrong!' });
    } else {
      await interaction.reply({
        content: '⚠️ Something went wrong!',
        ephemeral: true,
      });
    }
  }
});
/*client.on('messageReactionAdd', (reaction, user) => {
  handleReactionUpdate(reaction, user);
});

client.on('messageReactionRemove', (reaction, user) => {
  handleReactionUpdate(reaction, user);
});
*/

// Bot ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  resumeAllLivePolls(client);
  //startPollUpdater(); // 🔁 Start live poll updates
});

// Start everything
registerSlashCommands();
client.login(process.env.DISCORD_TOKEN);
export { client };