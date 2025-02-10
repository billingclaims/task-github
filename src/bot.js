import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ChannelType, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createIssues, listOpenIssues } from './utils/github-utils.js';
import { generateIssueContent, IssueSchema, IssueTemplates } from './utils/openai-utils.js';
import { logger } from './utils/logger.js';

// Initialize Discord Client with intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Slash Commands Setup
const commands = [
  {
    name: 'create-issue',
    description: 'Start a new GitHub issue creation flow',
    options: [{
      name: 'preview',
      type: 5,  // BOOLEAN type
      description: 'Show preview before creating',
      required: false
    }]
  },
  {
    name: 'list-issues',
    description: 'List open GitHub issues',
    options: [{
      name: 'assignee',
      type: 3,
      description: 'Filter by assignee',
      required: false
    }]
  },
  {
    name: 'test',
    description: 'Test bot connectivity'
  }
];

// Bot Ready Event
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  await client.application.commands.set(commands);
});

// Command Handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  try {
    if (interaction.commandName === 'create-issue') {
      const wantsPreview = interaction.options.getBoolean('preview') ?? false;
      const isDM = !interaction.guildId || interaction.channel?.type === ChannelType.DM;
      
      if (!isDM && !interaction.channel?.isTextBased()) {
        return interaction.reply({
          content: '❌ This command only works in text channels and DMs!',
          flags: MessageFlags.Ephemeral
        });
      }

      let targetChannel = interaction.channel;
      let thread = null;

      if (!isDM) {
        try {
          thread = await interaction.channel.threads.create({
            name: `Issue - ${interaction.user.username}`,
            autoArchiveDuration: 60
          });
          targetChannel = thread;
        } catch (error) {
          return interaction.reply({
            content: '❌ Failed to create thread!',
            flags: MessageFlags.Ephemeral
          });
        }
      }

      // Initial response
      await interaction.reply({
        content: isDM 
          ? '**Issue Creation Started**\nSend description/images then type `!done`' 
          : `Thread created: ${thread}`,
        flags: isDM ? 0 : MessageFlags.Ephemeral
      });

      // Ensure we have a valid channel reference
      const collectorChannel = isDM 
        ? await client.channels.fetch(interaction.channelId)
        : targetChannel;

      if (!collectorChannel) {
        return interaction.followUp({
          content: '❌ Failed to start message collection!',
          flags: MessageFlags.Ephemeral
        });
      }

      const collector = collectorChannel.createMessageCollector({
        filter: m => !m.author.bot,
        time: 600_000 // 10 minutes
      });

      const assets = { text: [], images: [] };

      collector.on('collect', async msg => {
        if (msg.author.bot) return;

        console.log(`Received message from ${msg.author.tag}: ${msg.content}... (${msg.attachments.size} attachments)`);

        if (msg.content.toLowerCase() === '!done') {
          collector.stop();
          return;
        }

        // Process attachments
        if (msg.attachments.size > 0) {
          console.log(`Processing ${msg.attachments.size} Discord attachments`);
          for (const [_, attachment] of msg.attachments) {
            try {
              // Directly use Discord's attachment URL
              console.log(`Adding Discord attachment URL: ${attachment.url}`);
              assets.images.push(attachment.url);
              await collectorChannel.send(`✅ Added image: ${attachment.name}`);
            } catch (error) {
              console.error('Attachment processing failed:', error);
              await collectorChannel.send(`❌ Failed to process attachment: ${attachment.name}`);
            }
          }
        }

        // Process text
        if (msg.content) {
          assets.text.push(msg.content);
          await collectorChannel.send(`✅ Added text: \n${msg.content}`);
        }
      });

      collector.on('end', async () => {
        logger.info('Message collection ended', { assets });
        const generatedIssues = await generateIssueContent(assets, collectorChannel);
        
        if (!wantsPreview) {
          const createdIssues = await createIssues(generatedIssues, assets);
          const successEmbed = new EmbedBuilder()
          .setTitle(`✅ Created ${createdIssues.length} Issues`)
          .setColor('#00FF00')
          .addFields(
            createdIssues.map(issue => ({
              name: issue.title,
              value: `[View Issue #${issue.number}](${issue.html_url})`,
              inline: true
            }))
          );

          await collectorChannel.send({
            embeds: [successEmbed],
            content: 'Issues successfully created:'
          });
          
          if (!isDM) await thread.setArchived(true);
          return;
        }
        
        // Store generated issues in assets for potential edits
        assets.generatedIssues = generatedIssues;

        // Create interactive buttons
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm')
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('edit')
            .setLabel('✏️ Edit')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
        );

        // Create preview embed
        const previewEmbeds = generatedIssues.map((issue, index) => {
          return new EmbedBuilder()
            .setTitle(`Issue #${index + 1}: ${issue.title}`)
            .setDescription(issue.body.slice(0, 200) + '...')
            .addFields(
              { name: 'Labels', value: issue.labels.join(', ') || 'None', inline: true },
              { name: 'Length', value: `${issue.body.length} characters`, inline: true }
            )
            .setColor('#FFA500');
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_issues')
            .setLabel(`Create ${generatedIssues.length} Issues`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('cancel_issues')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
        );

        const previewMessage = await collectorChannel.send({
          content: '**Review these issues**',
          embeds: previewEmbeds,
          components: [row]
        });

        // Create button collector
        const buttonCollector = previewMessage.createMessageComponentCollector({
          filter: i => i.user.id === interaction.user.id,
          time: 300_000 // 5 minutes
        });

        buttonCollector.on('collect', async buttonInteraction => {
          await buttonInteraction.deferUpdate();
          
          try {
            switch(buttonInteraction.customId) {
              case 'confirm_issues':
                buttonCollector.stop();
                
                // Create GitHub issues individually
                const createdIssues = await createIssues(generatedIssues, assets);
                
                // Unified embed creation
                const successEmbed = new EmbedBuilder()
                  .setTitle(`✅ Created ${createdIssues.length} Issues`)
                  .setColor('#00FF00')
                  .addFields(
                    createdIssues.map(issue => ({
                      name: issue.title,
                      value: `[View Issue #${issue.number}](${issue.html_url})`,
                      inline: true
                    }))
                  );

                await collectorChannel.send({
                  embeds: [successEmbed],
                  content: 'Issues successfully created:'
                });
                
                if (!isDM) await thread.setArchived(true);
                break;

              case 'edit':
                await collectorChannel.send({
                  content: 'What changes would you like? (Describe your edits)',
                  components: [] // Clear buttons during edit
                });
                
                // Collect edit instructions
                const editCollector = collectorChannel.createMessageCollector({
                  filter: m => m.author.id === interaction.user.id,
                  time: 120_000,
                  max: 1
                });

                editCollector.on('collect', async editMsg => {
                  console.log(`Received edit request: ${editMsg.content}`);
                  assets.text.push(`USER EDIT REQUEST: ${editMsg.content}`);
                  
                  // Regenerate with OpenAI
                  await collectorChannel.send('🔄 Regenerating issues with your feedback...');
                  assets.generatedIssues = await generateIssueContent(assets, collectorChannel);
                  
                  // Update preview with new buttons
                  previewEmbeds.splice(0, previewEmbeds.length, ...assets.generatedIssues.map((issue, index) => {
                    return new EmbedBuilder()
                      .setTitle(`Issue #${index + 1}: ${issue.title}`)
                      .setDescription(issue.body.slice(0, 200) + '...')
                      .addFields(
                        { name: 'Labels', value: issue.labels.join(', ') || 'None', inline: true },
                        { name: 'Length', value: `${issue.body.length} characters`, inline: true }
                      )
                      .setColor('#FFA500');
                  }));
                  
                  const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                      .setCustomId('confirm_issues')
                      .setLabel(`Create ${assets.generatedIssues.length} Issues`)
                      .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                      .setCustomId('cancel_issues')
                      .setLabel('Cancel')
                      .setStyle(ButtonStyle.Danger)
                  );

                  await previewMessage.edit({
                    content: '**Updated Preview**',
                    embeds: previewEmbeds,
                    components: [row]
                  });
                });
                break;

              case 'cancel_issues':
                buttonCollector.stop();
                await collectorChannel.send('❌ Issue creation canceled');
                if (!isDM) {
                  await thread.setArchived(true);
                }
                break;
            }
          } catch (error) {
            console.error('Button interaction error:', error);
            await collectorChannel.send(`❌ Error: ${error.message}`);
          }
        });

        buttonCollector.on('end', () => {
          previewMessage.edit({ components: [] }); // Disable buttons
        });
      });
    }

    if (interaction.commandName === 'list-issues') {
      const sortedItems = await listOpenIssues();
      // Create rich embeds with issue details
      const issueEmbeds = [];
      let currentEmbed = new EmbedBuilder()
        .setTitle(`📝 Open Issues (${sortedItems.length})`)
        .setColor('#7289DA')
        .setFooter({ text: 'GitHub Issues', iconURL: 'https://github.githubassets.com/favicons/favicon.png' })
        .setTimestamp();

      sortedItems.forEach((item, index) => {
        const issue = item.content;
        const status = item.fieldValueByName?.name || 'No status';
        const assignees = issue.assignees?.nodes?.map(a => a.login).join(', ') || 'Unassigned';
        const bodyPreview = issue.body?.slice(0, 100) + (issue.body?.length > 100 ? '...' : '') || 'No description';
        const fieldValue = `[#${issue.number}](${issue.url})`;


        currentEmbed.addFields({
          name: `${issue.title.slice(0, 50)}${issue.title.length > 50 ? '...' : ''}`,
          value: fieldValue + `\n**Status:** ${status}\n` +
                `**Assignee:** ${assignees}\n` +
                `**Description:** ${bodyPreview}`,
          inline: false
        });

        // Split into multiple embeds if approaching field limit
        if ((index + 1) % 4 === 0 && index !== sortedItems.length - 1) {
          issueEmbeds.push(currentEmbed);
          currentEmbed = new EmbedBuilder()
            .setColor('#7289DA')
            .setFooter({ text: 'GitHub Issues', iconURL: 'https://github.githubassets.com/favicons/favicon.png' })
            .setTimestamp();
        }
      });

      issueEmbeds.push(currentEmbed);

      await interaction.reply({
        content: `**Issues in Project** (${sortedItems.length} total)`,
        embeds: issueEmbeds,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('View Project Board')
              .setURL(`https://github.com/orgs/${process.env.GITHUB_REPO_OWNER}/projects/${process.env.GITHUB_PROJECT_NUMBER}/views/1`)
              .setStyle(ButtonStyle.Link)
          )
        ]
      });
    }

    if (interaction.commandName === 'test') {
      await interaction.reply('✅ Bot is operational!');
      const ping = Date.now() - interaction.createdTimestamp;
      await interaction.followUp(`🏓 Latency: ${ping}ms`);
    }
  } catch (error) {
    logger.error('Command handling failed', { error });
    await interaction.reply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true
    });
  }
});

// Start Bot
client.login(process.env.DISCORD_TOKEN);
