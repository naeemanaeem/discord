const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const readline = require('readline');
require('dotenv').config();

// Create the bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// On bot ready
client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// On message received
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  console.log(`📨 Incoming message: ${content}`);

  // Ping check
  if (content === '!ping') {
    return message.reply('🏓 Pong!');
  }

  // !ask → Query local LLM
  if (content.startsWith('!ask')) {
    const prompt = content.slice(4).trim();
    if (!prompt) return message.reply("Please provide a prompt after `!ask`.");

    try {
      const responseMessage = await message.reply("💭 Thinking...");

      const res = await axios.post(
        'http://localhost:11434/api/generate',
        { model: 'llama3', prompt, stream: true },
        { responseType: 'stream' }
      );

      let fullResponse = '';
      let updateCounter = 0;

      const rl = readline.createInterface({
        input: res.data,
        crlfDelay: Infinity,
      });

      rl.on('line', async (line) => {
        if (!line.trim()) return;
        try {
          const json = JSON.parse(line);
          if (json.done) return;
          fullResponse += json.response;

          if (++updateCounter % 20 === 0 || fullResponse.length < 40) {
            const chunk = fullResponse.slice(-1900);
            responseMessage.edit(`💡 ${chunk}`);
          }
        } catch (e) {
          console.error("JSON parse error:", e.message);
        }
      });

      rl.on('close', async () => {
        const finalChunk = fullResponse.slice(-1900);
        await responseMessage.edit(`💡 ${finalChunk}`);
      });

    } catch (err) {
      console.error("❌ Streaming error:", err.message);
      message.reply("Something went wrong while streaming from the LLM.");
    }
  }

  // !summarize → Summarize last 50 messages
  if (content === '!summarize') {
    const messages = await message.channel.messages.fetch({ limit: 50 });
    const convo = [...messages.values()]
      .reverse()
      .filter(m => !m.author.bot)
      .map(m => `${m.author.username}: ${m.content}`)
      .join('\n');

    const prompt = `Summarize this chat:\n${convo}`;
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      prompt,
      stream: false
    });

    message.reply(`📝 ${response.data.response}`);
  }

  // !stats → User message count
  if (content === '!stats') {
    const messages = await message.channel.messages.fetch({ limit: 100 });
    const counts = {};
    messages.forEach(m => {
      if (!m.author.bot) {
        counts[m.author.username] = (counts[m.author.username] || 0) + 1;
      }
    });

    const stats = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([user, count]) => `• ${user}: ${count}`)
      .join('\n');

    message.reply(`📊 Top Users:\n${stats}`);
  }

  // !modcheck → Basic moderation via LLM
  if (content === '!modcheck') {
    const messages = await message.channel.messages.fetch({ limit: 50 });
    const chatLog = [...messages.values()]
      .reverse()
      .map(m => `${m.author.username}: ${m.content}`)
      .join('\n');

    const prompt = `Check this chat for toxic or inappropriate messages:\n${chatLog}`;
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      prompt,
      stream: false
    });

    message.reply(`🚨 Moderation result:\n${response.data.response}`);
  }

  // !pinlast → Pin last non-bot message
  if (content === '!pinlast') {
    const messages = await message.channel.messages.fetch({ limit: 50 });
    const target = messages.find(m => !m.author.bot && !m.pinned);
    if (target) {
      await target.pin();
      message.reply(`📌 Pinned: "${target.content}"`);
    } else {
      message.reply("❌ No suitable message found to pin.");
    }
  }

  // !summarize voice → Placeholder
  if (content === '!summarize voice') {
    message.reply("🎤 Voice summarization requires audio transcription setup (e.g. Whisper).");
  }

  // !agenda → Generate agenda from chat
  if (content === '!agenda') {
    const messages = await message.channel.messages.fetch({ limit: 50 });
    const text = [...messages.values()]
      .reverse()
      .map(m => `${m.author.username}: ${m.content}`)
      .join('\n');

    const prompt = `Based on the following messages, generate a professional meeting agenda or weekly task list:\n${text}`;
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      prompt,
      stream: false
    });

    message.reply(`🗓️ Agenda:\n${response.data.response}`);
  }
});

// Start the bot
client.login(process.env.DISCORD_TOKEN);
