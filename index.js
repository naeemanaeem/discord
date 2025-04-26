const { Client, GatewayIntentBits, Collection, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const readline = require('readline');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const recentMessages = new Map(); // GuildID -> Array

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (!message.guild || message.author.bot) return;
  if (!recentMessages.has(message.guild.id)) {
    recentMessages.set(message.guild.id, []);
  }
  const cache = recentMessages.get(message.guild.id);
  cache.push(message);
  if (cache.length > 100) cache.shift();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'ask') {
    const prompt = options.getString('prompt');
    await interaction.reply('💭 Thinking...');

    try {
      const res = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3',
        prompt,
        stream: true,
      }, { responseType: 'stream' });

      let fullResponse = '';
      let editTimer;
      const rl = readline.createInterface({ input: res.data });

      rl.on('line', async (line) => {
        if (!line.trim()) return;
        try {
          const json = JSON.parse(line);
          if (json.done) return;

          fullResponse += json.response;

          // Debounced edit
          if (editTimer) clearTimeout(editTimer);
          editTimer = setTimeout(() => {
            interaction.editReply(`💡 ${fullResponse.slice(-1900)}`);
          }, 600); // Debounce delay
        } catch (e) {
          console.error('Parsing error:', e.message);
        }
      });

      rl.on('close', () => {
        interaction.editReply(`💡 ${fullResponse.slice(-1900)}`);
      });

    } catch (err) {
      console.error('Streaming error:', err.message);
      interaction.editReply('❌ Error during streaming.');
    }
  }

  if (commandName === 'summarize') {
    const channel = interaction.channel;
    const messages = await channel.messages.fetch({ limit: 100 });
  
    const content = messages
      .filter(m => !m.author.bot && m.content.trim())
      .map(m => `${m.author.username}: ${m.content}`)
      .reverse()
      .join('\n')
      .slice(-4000);
  
    await interaction.deferReply();
  
    if (!content.trim()) {
      return await interaction.editReply("⚠️ Not enough user messages to summarize.");
    }
  
    try {
      const res = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3',
        prompt: `Please summarize the following Discord conversation:\n\n${content}`,
        stream: false,
      });
  
      const summary = res.data.response || '⚠️ No summary generated.';
      await interaction.editReply(`📝 ${summary}`);
    } catch (err) {
      console.error('❌ Summarize command failed:', err.message);
      await interaction.editReply('❌ Could not summarize the messages.');
    }
  }

  else if (commandName === 'stats') {
    const total = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    interaction.reply(`📊 I'm active in ${client.guilds.cache.size} servers with ${total} users!`);
  }

  else if (commandName === 'modcheck') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isMod = member.permissions.has(PermissionsBitField.Flags.ManageMessages);
    interaction.reply(isMod ? '🛡️ You are a moderator!' : '🚫 You are not a moderator.');
  }

  else if (commandName === 'pinlast') {
    const channel = interaction.channel;
    const msgs = await channel.messages.fetch({ limit: 10 });
    const lastUserMsg = msgs.find(m => !m.author.bot);
    if (lastUserMsg) {
      await lastUserMsg.pin();
      interaction.reply(`📌 Pinned: "${lastUserMsg.content}"`);
    } else {
      interaction.reply('❌ No user messages found to pin.');
    }
  }

  else if (commandName === 'agenda') {
    const messages = recentMessages.get(interaction.guildId) || [];
    const content = messages.map(m => `${m.author.username}: ${m.content}`).join('\n');
    const prompt = `From this conversation, extract an agenda with bullet points:\n${content}`;

    await interaction.reply('📅 Generating agenda...');
    try {
      const res = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3',
        prompt,
        stream: false,
      });
      interaction.editReply(`🗒️ Agenda:\n${res.data.response}`);
    } catch (err) {
      console.error('Agenda error:', err.message);
      interaction.editReply('❌ Failed to generate agenda.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
