import { SlashCommandBuilder } from 'discord.js';
import { createInterface } from 'readline';
import { queryOllama } from '../utils/OllamaClient.js';

export const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask a question to the AI')
  .addStringOption(option =>
    option.setName('prompt')
      .setDescription('What do you want to ask?')
      .setRequired(true)
  );

export async function execute(interaction) {
  const prompt = interaction.options.getString('prompt');
  await interaction.reply('💭 Thinking...');

  try {
    const res = await queryOllama({ prompt, stream: true });
    if (res.status !== 200) {
      return interaction.editReply('❌ Error: ' + res.statusText);
    }

    let fullResponse = '';
    let editTimer;
    const rl = createInterface({ input: res.data });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      try {
        const json = JSON.parse(line);
        if (json.done) return;

        fullResponse += json.response;

        if (editTimer) clearTimeout(editTimer);
        editTimer = setTimeout(() => {
          interaction.editReply(`💡 ${fullResponse.slice(-1900)}`);
        }, 600);
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
