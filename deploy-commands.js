const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'ask',
    description: 'Ask a question to your local LLM',
    options: [{
      name: 'prompt',
      type: 3, // STRING
      description: 'Your question',
      required: true,
    }],
  },
  {
    name: 'ping',
    description: 'Check if the bot is alive',
  },
  {
    name: 'modcheck',
    description: 'Check if you are a moderator',
  },
  {
    name: 'pinlast',
    description: 'Pin the last non-bot message in the channel',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
