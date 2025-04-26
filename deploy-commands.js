require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask a question to the LLM')
    .addStringOption(opt =>
      opt.setName('prompt').setDescription('Your question').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('Summarize the last 100 messages'),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot stats'),
  new SlashCommandBuilder()
    .setName('modcheck')
    .setDescription('Check if you are a moderator'),
  new SlashCommandBuilder()
    .setName('pinlast')
    .setDescription('Pin the last user message'),
  new SlashCommandBuilder()
    .setName('agenda')
    .setDescription('Generate a meeting agenda from conversation'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
