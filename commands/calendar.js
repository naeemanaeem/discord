import { SlashCommandBuilder } from 'discord.js';
import { google } from 'googleapis';
import { getAuthedClient } from '../auth/googleAuth.js';

// /create-event
export const createEvent = {
  data: new SlashCommandBuilder()
    .setName('create-event')
    .setDescription('📅 Create a calendar event')
    .addStringOption(opt =>
      opt.setName('title').setDescription('Event title').setRequired(true))
    .addStringOption(opt =>
      opt.setName('date').setDescription('YYYY-MM-DD').setRequired(true))
    .addStringOption(opt =>
      opt.setName('time').setDescription('HH:MM (24h)').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('duration').setDescription('Duration in minutes')),

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const date = interaction.options.getString('date');
    const time = interaction.options.getString('time');
    const duration = interaction.options.getInteger('duration') || 60;

    await interaction.deferReply({ ephemeral: true });

    try {
      const auth = await getAuthedClient(interaction);
      const calendar = google.calendar({ version: 'v3', auth });

      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start.getTime() + duration * 60000);

      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          reminders: { useDefault: true },
        },
      });

      await interaction.editReply(`✅ Event created: [${title}](${res.data.htmlLink})`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed to create event.');
    }
  }
};

// /list-events
export const listEvents = {
  data: new SlashCommandBuilder()
    .setName('list-events')
    .setDescription('📆 List upcoming calendar events'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const auth = await getAuthedClient(interaction);
      const calendar = google.calendar({ version: 'v3', auth });

      const { data } = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime',
      });

      if (!data.items.length) return interaction.editReply('😴 No upcoming events.');

      const list = data.items.map(e => {
        const when = new Date(e.start.dateTime || e.start.date).toLocaleString();
        return `• **${e.summary}** — ${when} (ID: \`${e.id.slice(0, 8)}\`)`;
      });

      await interaction.editReply(list.join('\n'));
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed to list events.');
    }
  }
};

// /update-event
export const updateEvent = {
  data: new SlashCommandBuilder()
    .setName('update-event')
    .setDescription('✏️ Update an existing calendar event')
    .addStringOption(opt =>
      opt.setName('id').setDescription('Event ID').setRequired(true))
    .addStringOption(opt =>
      opt.setName('title').setDescription('New title'))
    .addStringOption(opt =>
      opt.setName('date').setDescription('New date (YYYY-MM-DD)'))
    .addStringOption(opt =>
      opt.setName('time').setDescription('New time (HH:MM)')),

  async execute(interaction) {
    const id = interaction.options.getString('id');
    const newTitle = interaction.options.getString('title');
    const newTime = interaction.options.getString('time');
    const newDate = interaction.options.getString('date');

    await interaction.deferReply({ ephemeral: true });

    try {
      const auth = await getAuthedClient(interaction);
      const calendar = google.calendar({ version: 'v3', auth });

      const event = await calendar.events.get({ calendarId: 'primary', eventId: id });

      const updates = {};
      if (newTitle) updates.summary = newTitle;

      if (newDate || newTime) {
        const oldStart = new Date(event.data.start.dateTime || event.data.start.date);
        const startDate = newDate || oldStart.toISOString().split('T')[0];
        const startTime = newTime || oldStart.toISOString().split('T')[1].slice(0, 5);
        const newStart = new Date(`${startDate}T${startTime}:00`);
        const newEnd = new Date(newStart.getTime() + 60 * 60000);

        updates.start = { dateTime: newStart.toISOString() };
        updates.end = { dateTime: newEnd.toISOString() };
      }

      const res = await calendar.events.patch({
        calendarId: 'primary',
        eventId: id,
        requestBody: updates,
      });

      await interaction.editReply(`🛠️ Event updated: [${res.data.summary}](${res.data.htmlLink})`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed to update event. Check the ID.');
    }
  }
};

// /delete-event
export const deleteEvent = {
  data: new SlashCommandBuilder()
    .setName('delete-event')
    .setDescription('🗑️ Delete a calendar event by ID')
    .addStringOption(opt =>
      opt.setName('id').setDescription('Event ID').setRequired(true)),

  async execute(interaction) {
    const id = interaction.options.getString('id');

    await interaction.deferReply({ ephemeral: true });

    try {
      const auth = await getAuthedClient(interaction);
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({ calendarId: 'primary', eventId: id });

      await interaction.editReply(`🗑️ Event deleted (ID: \`${id}\`).`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed to delete event. Check the ID.');
    }
  }
};
