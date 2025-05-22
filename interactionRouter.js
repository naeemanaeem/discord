export async function handleInteraction(interaction, client) {
    const command = client.commands.get(interaction.commandName);
  
    if (!command) {
      return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
    }
  
    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`❌ Error in command '${interaction.commandName}':`, error);
      await interaction.reply({ content: '⚠️ There was an error executing that command.', ephemeral: true });
    }
  }
  