const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const readline = require('readline');
const path = require('path');
require('dotenv').config();

// Initialize client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const fs = require('fs');
const recentMessages = new Map();  // This will store messages per guild

const POLL_FILE = path.join(__dirname, 'polls.json');
let activePolls = new Map();
const AGENDA_FILE = './data/agenda.json';

// Ensure poll storage file exists
if (!fs.existsSync(POLL_FILE)) fs.writeFileSync(POLL_FILE, '{}');

function savePollsToFile() {
  const obj = Object.fromEntries(activePolls);
  fs.writeFileSync(POLL_FILE, JSON.stringify(obj, null, 2));
}

async function transcribeVoiceChannel(channel) {
  // This is a placeholder. You'll need to implement voice capture and transcription.
  const conversation = []; // Gather conversation transcript here (from the API).

  // Example: You can use a Speech-to-Text API to get the transcript of the voice channel.
  try {
    const audioUrl = await recordVoiceChannel(channel); // Record voice and get audio file URL.
    const transcription = await transcribeAudio(audioUrl); // Transcribe audio file.
    return transcription;
  } catch (error) {
    console.error('Error transcribing voice channel:', error.message);
    return [];
  }
}

async function transcribeAudio(audioUrl) {
  const response = await axios.post('https://api.assemblyai.com/v2/transcript', {
    audio_url: audioUrl
  });
  const transcriptId = response.data.id;

  // Poll until transcription is complete
  while (true) {
    const result = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`);
    if (result.data.status === 'completed') {
      return result.data.text.split('\n'); // Split conversation into lines
    }
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
  }
}
function resumePendingPolls(client) {
  const polls = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
  const now = Date.now();

  for (const [pollId, pollData] of Object.entries(polls)) {
    const expiresIn = pollData.expiresAt - now;
    if (expiresIn > 0) {
      setTimeout(() => {
        tallyPollResults(client, pollId, pollData);
      }, expiresIn);
    } else {
      // If already expired, tally immediately
      tallyPollResults(client, pollId, pollData);
    }
  }
}

function tallyPollResults(client, messageId, pollData) {
  const { options, channelId } = pollData;
  if (!channelId) {
    console.error(`❌ Missing channelId in pollData for message ${messageId}`);
    return;
  }
  client.channels.fetch(channelId)
    .then(channel => channel.messages.fetch(messageId))
    .then(async pollMessage => {
      const reactionCounts = {};
      for (const opt of options) {
        const reaction = pollMessage.reactions.cache.get(opt.emoji);
        reactionCounts[opt.emoji] = (reaction ? reaction.count - 1 : 0); // exclude bot
      }

      let result = `🗳️ **Poll Results:**\n\n`;
      for (const opt of options) {
        result += `${opt.emoji} ${opt.label} — ${reactionCounts[opt.emoji] || 0} votes\n`;
      }

      await pollMessage.reply(result);

      // Clean up
      const polls = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
      delete polls[messageId];
      fs.writeFileSync(POLL_FILE, JSON.stringify(polls, null, 2));
    })
    .catch(console.error);
}


async function summarizePoll(messageId, pollData) {
  try {
    const channel = await client.channels.fetch(pollData.channelId);
    const message = await channel.messages.fetch(messageId);
    const results = [];

    for (let i = 0; i < pollData.options.length; i++) {
      const emoji = pollData.emojis[i];
      const reaction = message.reactions.cache.get(emoji);
      const count = reaction ? reaction.count - 1 : 0;
      results.push({ text: pollData.options[i], votes: count });
    }

    results.sort((a, b) => b.votes - a.votes);
    const summary = results.map(r => `• **${r.votes} votes** - ${r.text}`).join('\n');

    await channel.send({
      embeds: [{
        title: '🗳️ Poll Results',
        description: summary,
        color: 0x00AE86,
      }]
    });

    activePolls.delete(messageId);
    savePollsToFile();
  } catch (e) {
    console.error(`Failed to summarize poll ${messageId}:`, e.message);
  }
}

// Capture incoming messages and store them in the cache
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;  // Ignore bot messages

  const guildId = message.guild.id;

  // Initialize the array for the guild if it doesn't exist
  if (!recentMessages.has(guildId)) {
    recentMessages.set(guildId, []);
  }

  // Get the messages for the current guild
  const guildMessages = recentMessages.get(guildId);

  // Add the new message to the array of recent messages
  guildMessages.push({
    author: message.author.username,
    content: message.content,
    timestamp: message.createdTimestamp,
  });

  // Limit the number of recent messages to store
  if (guildMessages.length > 100) {
    guildMessages.shift(); // Remove the oldest message if more than 100
  }

  // Log for debugging
  console.log(`Messages for guild ${guildId}:`, guildMessages);
});


client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  resumePendingPolls(client); // ✅ Pass client here
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;
  const activePolls = new Map();
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
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (subcommand === 'generate') {
      console.log(`🔍 Processing agenda for guild: ${guildId}`);

      const messages = recentMessages.get(guildId) || [];
      if (messages.length < 3) {
        return interaction.reply("There isn't enough conversation to extract an agenda from. Try chatting a bit more first!");
      }

      const content = messages.map(m => `${m.author}: ${m.content}`).join('\n');
      const prompt = `From this conversation, extract an agenda with bullet points:\n${content}`;
      console.log(`📜 Generated prompt for agenda: ${prompt}`);

      await interaction.reply('📅 Generating agenda...');

      try {
        const res = await axios.post('http://localhost:11434/api/generate', {
          model: 'llama3',
          prompt,
          stream: false,
        });

        console.log(`📝 LLM Response: ${JSON.stringify(res.data)}`);
        interaction.editReply(`🗒️ Agenda:\n${res.data.response}`);
      } catch (err) {
        console.error('Agenda error:', err.message);
        interaction.editReply('❌ Failed to generate agenda.');
      }
    }

    else if (subcommand === 'add') {
      const title = interaction.options.getString('title');
      const date = interaction.options.getString('date');
      const time = interaction.options.getString('time');
      const datetime = `${date} ${time}`;

      const event = {
        title,
        datetime,
        addedBy: interaction.user.username,
        timestamp: new Date(datetime).getTime()
      };

      const events = fs.existsSync(AGENDA_FILE)
        ? JSON.parse(fs.readFileSync(AGENDA_FILE))
        : [];

      events.push(event);
      events.sort((a, b) => a.timestamp - b.timestamp);
      fs.writeFileSync(AGENDA_FILE, JSON.stringify(events, null, 2));

      return interaction.reply(`📌 Event **${title}** scheduled for **${datetime}**`);
    }

    else if (subcommand === 'list') {
      const events = fs.existsSync(AGENDA_FILE)
        ? JSON.parse(fs.readFileSync(AGENDA_FILE))
        : [];

      if (events.length === 0) {
        return interaction.reply('📭 No events scheduled yet.');
      }

      const upcoming = events
        .filter(e => e.timestamp > Date.now())
        .slice(0, 5)
        .map(e => `• **${e.title}** on ${e.datetime} (by ${e.addedBy})`)
        .join('\n');

      return interaction.reply(`📅 **Upcoming Events:**\n${upcoming}`);
    }
  }

  else if (commandName === 'poll') {
    const question = interaction.options.getString('question');
    const options = [
      interaction.options.getString('option1'),
      interaction.options.getString('option2'),
      interaction.options.getString('option3'),
      interaction.options.getString('option4'),
      interaction.options.getString('option5'),
    ].filter(Boolean);

    const emojiList = ['🇦', '🇧', '🇨', '🇩', '🇪'];

    if (options.length < 2) {
      return interaction.reply({ content: '❌ You need at least 2 options.', ephemeral: true });
    }

    // 👉 FETCH recent messages and summarize
    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const content = messages
      .filter(msg => !msg.author.bot)
      .map(msg => `${msg.author.username}: ${msg.content}`)
      .reverse()
      .join('\n');

    const prompt = `Summarize the following Discord conversation for poll context:\n${content}`;

    let summary = 'No summary available.';
    try {
      const res = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3',
        prompt,
        stream: false,
      });
      summary = res.data.response.trim();
    } catch (err) {
      console.error('Error summarizing chat:', err.message);
    }

    // 👉 CREATE Poll Embed with Summary
    const description = options.map((opt, index) => `${emojiList[index]} ${opt}`).join('\n');

    const pollEmbed = {
      color: 0x0099ff,
      title: `📊 ${question}`,
      description,
      fields: [
        { name: '🧠 Discussion Summary', value: summary.slice(0, 1024) } // Discord field max length: 1024
      ],
      footer: { text: `Poll created by ${interaction.user.username}` },
    };

    // 👉 SEND poll
    const pollMessage = await interaction.reply({ embeds: [pollEmbed], fetchReply: true });

    for (let i = 0; i < options.length; i++) {
      await pollMessage.react(emojiList[i]);
    }

    // 👉 TRACK poll for auto-closing
    activePolls.set(pollMessage.id, {
      creatorId: interaction.user.id,
      endTime: Date.now() + 60 * 60 * 1000,
      options: emojiList.slice(0, options.length),
      channelId: interaction.channel.id,
    });

    setTimeout(async () => {
      const pollData = activePolls.get(pollMessage.id);
      if (!pollData) return;

      const channel = await client.channels.fetch(pollData.channelId);
      const message = await channel.messages.fetch(pollMessage.id);

      const results = [];
      for (const [emoji, reaction] of message.reactions.cache) {
        results.push(`${emoji} - ${reaction.count - 1} votes`);
      }

      const resultEmbed = {
        color: 0x00ff00,
        title: `📊 Poll Results: ${question}`,
        description: results.join('\n'),
      };

      await channel.send({ embeds: [resultEmbed] });
      activePolls.delete(pollMessage.id);
    }, 5 * 60 * 1000);
  }

  else if (commandName === 'pollresults') {
    const messageId = interaction.options.getString('messageid');
    const channel = interaction.channel;

    try {
      const pollMessage = await channel.messages.fetch(messageId);

      const reactions = pollMessage.reactions.cache;
      if (reactions.size === 0) {
        return interaction.reply('❌ No reactions found on that message.');
      }

      let results = '📊 **Poll Results:**\n';
      for (const [emoji, reaction] of reactions) {
        results += `${emoji} - ${reaction.count - 1} votes\n`; // subtract 1 for the bot's own reaction
      }

      interaction.reply(results);
    } catch (err) {
      console.error('Poll results error:', err.message);
      interaction.reply('❌ Failed to fetch poll results. Make sure the message ID is correct.');
    }
  }
  else if (commandName === 'summarize-voice') {
    const channel = options.getChannel('channel');
    if (!channel || channel.type !== 'GUILD_VOICE') {
      return interaction.reply('❌ Please select a valid voice channel.');
    }

    await interaction.reply('🎤 Summarizing the voice channel...');

    try {
      // Assume you already have a transcription of the voice channel.
      // For example, you can use Google or AssemblyAI APIs to transcribe it.

      const transcription = await transcribeVoiceChannel(channel); // Your method to transcribe voice chat

      if (!transcription || transcription.length === 0) {
        return interaction.editReply('❌ No conversation was detected in the voice channel.');
      }

      const prompt = `Please summarize the following conversation:\n${transcription.join('\n')}`;
      const res = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3',
        prompt,
        stream: false,
      });

      interaction.editReply(`📝 Voice Channel Summary:\n${res.data.response}`);
    } catch (err) {
      console.error('Summarizing voice channel error:', err.message);
      interaction.editReply('❌ Failed to summarize the voice channel.');
    }
  }
  else if (commandName === 'poll-from-likes') {
    const count = interaction.options.getInteger('count') || 5;
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    if (!targetChannel.viewable) {
      return interaction.reply('❌ I do not have access to that channel.');
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const messages = await targetChannel.messages.fetch({ limit: 100 });

    const positiveEmojis = ['👍', '❤️', '🔥', '💯'];

    const topMessages = messages
      .map(m => {
        const totalLikes = positiveEmojis.reduce((sum, emoji) => {
          return sum + (m.reactions.cache.get(emoji)?.count || 0);
        }, 0);
        return {
          content: m.content || '[No text content]',
          likes: totalLikes,
          timestamp: m.createdTimestamp,
        };
      })
      .filter(m => m.timestamp > sevenDaysAgo && m.likes > 0)
      .sort((a, b) => b.likes - a.likes)
      .slice(0, count);

    if (topMessages.length === 0) {
      return interaction.reply('❌ No messages with positive reactions found.');
    }

    const pollOptions = topMessages.map((m, i) => {
      const words = m.content.split(/\s+/).slice(0, 200).join(' ');
      return {
        label: words,
        emoji: `${i + 1}️⃣`,
        fullContent: m.content,
        likes: m.likes,
      };
    });

    let pollText = `📊 **Poll Based on Top Messages (👍❤️🔥💯 - Last 7 Days)**\n\n`;
    pollOptions.forEach(opt => {
      pollText += `${opt.emoji} (${opt.likes} total likes)\n${opt.label}\n\n`;
    });

    const pollMessage = await interaction.reply({ content: pollText, fetchReply: true });
    for (const opt of pollOptions) {
      await pollMessage.react(opt.emoji);
    }

    const polls = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
    polls[pollMessage.id] = {
      channelId: pollMessage.channel.id,
      options: pollOptions,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    fs.writeFileSync(POLL_FILE, JSON.stringify(polls, null, 2));
  }



  else if (commandName === 'help') {
    const helpText = `
  **Commands:**
  - \`/ask <prompt>\`: Ask a question.
  - \`/summarize\`: Summarize the last 100 messages in the channel.
  - \`/stats\`: Get bot stats.
  - \`/modcheck\`: Check if you're a moderator.
  - \`/pinlast\`: Pin the last user message.
  - \`/agenda\`: Generate an agenda from recent messages.
  - \`/poll <question> <option1> <option2> ...\`: Create a poll.
  - \`/pollresults <messageId>\`: Get results of a poll.
  - \`/summarize-voice <channel>\`: Summarize a voice channel conversation.
  - \`/poll-from-likes [count]\`: Create a poll from the most liked messages.
  `;
    interaction.reply(helpText);
  }

});

client.login(process.env.DISCORD_TOKEN);
