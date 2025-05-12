require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll with up to 5 options')
        .addStringOption(opt =>
            opt.setName('question').setDescription('The poll question').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('option1').setDescription('First option').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('option2').setDescription('Second option').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('option3').setDescription('Third option (optional)').setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('option4').setDescription('Fourth option (optional)').setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('option5').setDescription('Fifth option (optional)').setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('pollresults')
        .setDescription('Get the results of a poll by message ID')
        .addStringOption(opt =>
            opt.setName('messageid')
                .setDescription('The ID of the poll message')
                .setRequired(true)
        ),
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
        .setDescription('Generate a meeting agenda from conversation')
        .addSubcommand(sub =>
            sub.setName('generate')
                .setDescription('Generate agenda from recent messages')
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Manually add a calendar event')
                .addStringOption(opt => opt.setName('title').setDescription('Event title').setRequired(true))
                .addStringOption(opt => opt.setName('date').setDescription('Date (e.g. 2025-05-15)').setRequired(true))
                .addStringOption(opt => opt.setName('time').setDescription('Time (e.g. 14:30)').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List upcoming events')),
    new SlashCommandBuilder()
        .setName('summarize-voice')
        .setDescription('Summarize the conversation from a voice channel')
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Voice channel to summarize')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('poll-from-likes')
        .setDescription('Create a poll from the most liked messages in a channel')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to extract messages from')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('How many top liked messages to include (default: 5)')
                .setRequired(false)
        ),
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
///pollresults messageid: 123456789012345678