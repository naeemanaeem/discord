// commands/announce-event.js
import { SlashCommandBuilder, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { google } from 'googleapis';
import { getAuthedClient } from '../auth/googleAuth.js';
import { URLSearchParams } from 'url';

export const data = new SlashCommandBuilder()
    .setName('announce-event')
    .setDescription('📅 Announce an event, create it in Google Calendar, and let people RSVP')
    .addStringOption(opt =>
        opt.setName('title')
            .setDescription('What’s the event called?')
            .setRequired(true)
    )
    .addStringOption(opt =>
        opt.setName('when')
            .setDescription('Start date & time (e.g. “tomorrow at 3pm” or “2025-06-24T14:30Z”)')
            .setRequired(true)
    )
    .addStringOption(opt =>
        opt.setName('where')
            .setDescription('Location or meeting link')
            .setRequired(false)
    ).addIntegerOption(opt =>
        opt.setName('duration')
            .setDescription('Duration in minutes (e.g. 30, 60, 90)')
            .setRequired(false)
    );

const rsvps = new Map(); // messageId → { going: Set<userId>, notGoing: Set<userId> }

// helper to format for Google Calendar TEMPLATE links
function formatDateTime(date) {
    const pad = n => n.toString().padStart(2, '0');
    return date.getUTCFullYear().toString()
        + pad(date.getUTCMonth() + 1)
        + pad(date.getUTCDate())
        + 'T'
        + pad(date.getUTCHours())
        + pad(date.getUTCMinutes())
        + pad(date.getUTCSeconds())
        + 'Z';
}

export async function execute(interaction) {
    const title = interaction.options.getString('title');
    const when = interaction.options.getString('when');
    // Try natural language first
    let start = chrono.parseDate(whenInput);

    // Fallback: try ISO string if chrono fails
    if (!start || isNaN(start)) {
        try {
            start = new Date(whenInput);
        } catch (e) {
            await interaction.reply({ content: `❌ Couldn't understand the time. Please use "next Friday at 3pm" or ISO format like 2025-06-24T14:00Z.`, ephemeral: true });
            return;
        }
    }
    const where = interaction.options.getString('where') || 'TBD';

    await interaction.deferReply();

    // 1️⃣ Insert into Google Calendar
    let addToCalUrl = null;
    try {
        const auth = await getAuthedClient(interaction);
        const calendar = google.calendar({ version: 'v3', auth });
        //const start = new Date(when);
        const duration = interaction.options.getInteger('duration') || 60;
        const end = new Date(start.getTime() + duration * 60000);


        const { data: ev } = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: title,
                location: where,
                start: { dateTime: start.toISOString() },
                end: { dateTime: end.toISOString() },
                reminders: { useDefault: true }
            }
        });

        // build a public “Add to Calendar” prefill link
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: title,
            dates: `${formatDateTime(start)}/${formatDateTime(end)}`,
            details: ev.description || '',
            location: where,
        });
        addToCalUrl = `https://calendar.google.com/calendar/render?${params}`;
    } catch (err) {
        console.error('Google Calendar insert failed:', err);
        // We'll still post in Discord even if Calendar insertion failed
    }

    // 2️⃣ Build and send the embed
    const embed = new EmbedBuilder()
        .setTitle(`📅 ${title}`)
        .addFields(
            { name: 'When', value: new Date(when).toLocaleString(), inline: true },
            { name: 'Duration', value: `${duration} min`, inline: true },
            { name: 'Where', value: where, inline: true },
        )
        .setDescription('React with ✅ to attend, ❌ if you can’t make it.')
        .setColor(Colors.Blue);

    const msg = await interaction.editReply({ embeds: [embed], fetchReply: true });

    // 3️⃣ Initialize RSVP state
    rsvps.set(msg.id, { going: new Set(), notGoing: new Set() });

    // 4️⃣ Add the RSVP reactions
    await msg.react('✅');
    await msg.react('❌');

    // 5️⃣ If we got a valid Add-to-Calendar URL, send it as a button
    if (addToCalUrl) {
        const btn = new ButtonBuilder()
            .setLabel('➕ Add to Google Calendar')
            .setStyle(ButtonStyle.Link)
            .setURL(addToCalUrl);

        const row = new ActionRowBuilder().addComponents(btn);
        await interaction.followUp({ components: [row] });
    }

    return msg.id;
}

export async function handleAnnouncementReaction(reaction, user) {
    if (user.bot) return;
    const msg = reaction.message;
    const state = rsvps.get(msg.id);
    if (!state) return;

    // update RSVP sets
    if (reaction.emoji.name === '✅') {
        state.going.add(user.id);
        state.notGoing.delete(user.id);
    } else if (reaction.emoji.name === '❌') {
        state.notGoing.add(user.id);
        state.going.delete(user.id);
    } else {
        return;
    }

    // rebuild embed with attendance fields
    const going = [...state.going].map(id => `<@${id}>`).join(', ') || '—';
    const notGoing = [...state.notGoing].map(id => `<@${id}>`).join(', ') || '—';

    const updated = EmbedBuilder.from(msg.embeds[0])
        .setFields(
            { name: '✅ Going', value: going, inline: false },
            { name: '❌ Not going', value: notGoing, inline: false }
        );

    await msg.edit({ embeds: [updated] });
}
