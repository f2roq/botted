const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class BackupCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'backup',
			group: 'protection',
			description: 'Create or restore server backups of channels and roles',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['create', 'restore', 'list', 'info', 'delete'],
					prompt: 'What would you like to do? (create/restore/list/info/delete)',
					default: 'list'
				},
				{
					key: 'type',
					type: 'string',
					oneOf: ['all', 'roles', 'channels'],
					prompt: 'What type of backup? (all/roles/channels)',
					default: 'all'
				},
				{
					key: 'label',
					type: 'string',
					prompt: 'Provide a label for this backup (use the label when restoring)',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, type, label }) {
		try {
			const guildId = msg.guild.id;
			const backupKey = `protection:${guildId}:backups`;
			const timestamp = Date.now();
			
			// If no label is provided, generate one based on date for creation
			if (action === 'create' && !label) {
				const date = new Date();
				label = `backup-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
			}
			
			if (action === 'list') {
				// List all backups
				const backups = await this.client.redis.db.hgetall(`${backupKey}:index`) || {};
				
				if (Object.keys(backups).length === 0) {
					return msg.reply('No backups found for this server.');
				}
				
				const embed = new EmbedBuilder()
					.setTitle('📦 Server Backups')
					.setColor(0x00AE86)
					.setDescription('Use `backup info <label>` to see details about a specific backup.')
					.setFooter({ text: `Server ID: ${guildId}` });
				
				// Sort backups by creation date (newest first)
				const sortedBackups = Object.entries(backups)
					.map(([key, value]) => {
						const backupData = JSON.parse(value);
						return { label: key, data: backupData };
					})
					.sort((a, b) => b.data.timestamp - a.data.timestamp);
				
				let backupList = '';
				for (const backup of sortedBackups) {
					const date = new Date(backup.data.timestamp);
					backupList += `**${backup.label}** - ${backup.data.type} backup from ${date.toLocaleString()}\n`;
				}
				
				embed.addFields({ name: 'Available Backups', value: backupList });
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'info') {
				if (!label) {
					return msg.reply('Please provide a backup label to view its details.');
				}
				
				const backupIndex = await this.client.redis.db.hget(`${backupKey}:index`, label);
				if (!backupIndex) {
					return msg.reply(`No backup found with label "${label}".`);
				}
				
				const indexData = JSON.parse(backupIndex);
				const embed = new EmbedBuilder()
					.setTitle(`Backup Info: ${label}`)
					.setColor(0x00AE86)
					.setDescription(`Backup created on ${new Date(indexData.timestamp).toLocaleString()}`)
					.addFields(
						{ name: 'Type', value: indexData.type, inline: true },
						{ name: 'Created By', value: indexData.creator || 'Unknown', inline: true }
					);
				
				// Add content summary
				if (indexData.type === 'all' || indexData.type === 'roles') {
					const rolesData = await this.client.redis.db.get(`${backupKey}:${label}:roles`);
					if (rolesData) {
						const roles = JSON.parse(rolesData);
						embed.addFields({ name: 'Roles', value: `${roles.length} roles backed up`, inline: true });
					}
				}
				
				if (indexData.type === 'all' || indexData.type === 'channels') {
					const channelsData = await this.client.redis.db.get(`${backupKey}:${label}:channels`);
					if (channelsData) {
						const channels = JSON.parse(channelsData);
						embed.addFields({ name: 'Channels', value: `${channels.length} channels backed up`, inline: true });
					}
				}
				
				embed.addFields({ 
					name: 'Restore Command', 
					value: `\`backup restore ${indexData.type} ${label}\``, 
					inline: false 
				});
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'create') {
				await msg.reply(`Creating ${type} backup with label "${label}"... This may take a moment.`);
				
				let roleBackup = [];
				let channelBackup = [];
				
				// Backup roles
				if (type === 'all' || type === 'roles') {
					roleBackup = await this.backupRoles(msg.guild);
					await this.client.redis.db.set(`${backupKey}:${label}:roles`, JSON.stringify(roleBackup));
				}
				
				// Backup channels
				if (type === 'all' || type === 'channels') {
					channelBackup = await this.backupChannels(msg.guild);
					await this.client.redis.db.set(`${backupKey}:${label}:channels`, JSON.stringify(channelBackup));
				}
				
				// Create index entry
				const indexData = {
					type,
					timestamp,
					creator: `${msg.author.tag} (${msg.author.id})`,
					roleCount: roleBackup.length,
					channelCount: channelBackup.length
				};
				
				await this.client.redis.db.hset(`${backupKey}:index`, label, JSON.stringify(indexData));
				
				const successEmbed = new EmbedBuilder()
					.setTitle('✅ Backup Created')
					.setColor(0x00AE86)
					.setDescription(`Successfully created backup with label "${label}"`)
					.addFields(
						{ name: 'Type', value: type, inline: true },
						{ name: 'Roles Backed Up', value: roleBackup.length.toString(), inline: true },
						{ name: 'Channels Backed Up', value: channelBackup.length.toString(), inline: true },
						{ name: 'Restore Command', value: `\`backup restore ${type} ${label}\``, inline: false }
					);
				
				return msg.reply({ embeds: [successEmbed] });
			}
			
			else if (action === 'restore') {
				if (!label) {
					return msg.reply('Please provide a backup label to restore.');
				}
				
				// Check if backup exists
				const backupIndex = await this.client.redis.db.hget(`${backupKey}:index`, label);
				if (!backupIndex) {
					return msg.reply(`No backup found with label "${label}".`);
				}
				
				const indexData = JSON.parse(backupIndex);
				
				// Confirm restore
				await msg.reply(`⚠️ **WARNING**: Restoring a backup may overwrite existing server data. Are you sure you want to restore the ${indexData.type} backup "${label}" from ${new Date(indexData.timestamp).toLocaleString()}? Reply with "yes" to confirm.`);
				
				// Wait for confirmation
				const filter = m => m.author.id === msg.author.id && m.content.toLowerCase() === 'yes';
				const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 30000 });
				
				if (collected.size === 0) {
					return msg.reply('Restore operation cancelled due to timeout.');
				}
				
				// Begin restore
				await msg.reply(`Starting restore of ${indexData.type} backup "${label}"... This may take a while.`);
				
				// Restore roles
				if (indexData.type === 'all' || indexData.type === 'roles') {
					const rolesData = await this.client.redis.db.get(`${backupKey}:${label}:roles`);
					if (rolesData) {
						const roles = JSON.parse(rolesData);
						await this.restoreRoles(msg.guild, roles, msg);
					}
				}
				
				// Restore channels
				if (indexData.type === 'all' || indexData.type === 'channels') {
					const channelsData = await this.client.redis.db.get(`${backupKey}:${label}:channels`);
					if (channelsData) {
						const channels = JSON.parse(channelsData);
						await this.restoreChannels(msg.guild, channels, msg);
					}
				}
				
				return msg.reply(`✅ Restore of backup "${label}" completed.`);
			}
			
			else if (action === 'delete') {
				if (!label) {
					return msg.reply('Please provide a backup label to delete.');
				}
				
				// Check if backup exists
				const backupIndex = await this.client.redis.db.hget(`${backupKey}:index`, label);
				if (!backupIndex) {
					return msg.reply(`No backup found with label "${label}".`);
				}
				
				// Delete backup data
				const indexData = JSON.parse(backupIndex);
				
				if (indexData.type === 'all' || indexData.type === 'roles') {
					await this.client.redis.db.del(`${backupKey}:${label}:roles`);
				}
				
				if (indexData.type === 'all' || indexData.type === 'channels') {
					await this.client.redis.db.del(`${backupKey}:${label}:channels`);
				}
				
				// Delete index entry
				await this.client.redis.db.hdel(`${backupKey}:index`, label);
				
				return msg.reply(`Backup "${label}" has been deleted.`);
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} backup: ${err.message}`);
		}
	}
	
	// Helper methods
	async backupRoles(guild) {
		const roles = guild.roles.cache
			.filter(role => !role.managed && role.id !== guild.id) // Filter out managed roles and @everyone
			.sort((a, b) => b.position - a.position) // Sort by position
			.map(role => ({
				id: role.id,
				name: role.name,
				color: role.hexColor,
				hoist: role.hoist,
				position: role.position,
				permissions: role.permissions.toString(),
				mentionable: role.mentionable
			}));
		
		return roles;
	}
	
	async backupChannels(guild) {
		// Get all channels
		const channels = guild.channels.cache
			.sort((a, b) => a.position - b.position)
			.map(channel => {
				const baseData = {
					id: channel.id,
					name: channel.name,
					type: channel.type,
					position: channel.position,
					parentId: channel.parentId
				};
				
				// Add type-specific properties
				if (channel.type === 0) { // Text channel
					return {
						...baseData,
						topic: channel.topic,
						nsfw: channel.nsfw,
						rateLimitPerUser: channel.rateLimitPerUser
					};
				} else if (channel.type === 2) { // Voice channel
					return {
						...baseData,
						bitrate: channel.bitrate,
						userLimit: channel.userLimit
					};
				} else if (channel.type === 4) { // Category
					return baseData;
				} else {
					return baseData;
				}
			});
		
		return channels;
	}
	
	async restoreRoles(guild, roles, msg) {
		let restored = 0;
		let skipped = 0;
		
		// First, restore roles without trying to set positions
		for (const roleData of roles) {
			try {
				// Check if role with same name already exists
				const existingRole = guild.roles.cache.find(r => r.name === roleData.name);
				
				if (existingRole) {
					skipped++;
					continue;
				}
				
				await guild.roles.create({
					name: roleData.name,
					color: roleData.color,
					hoist: roleData.hoist,
					permissions: BigInt(roleData.permissions),
					mentionable: roleData.mentionable
				});
				
				restored++;
				
				// Throttle to avoid rate limits
				if (restored % 5 === 0) {
					await new Promise(resolve => setTimeout(resolve, 5000));
					await msg.channel.send(`Restored ${restored} roles so far...`);
				}
				
			} catch (error) {
				this.client.logger.error(`Failed to restore role ${roleData.name}: ${error}`);
			}
		}
		
		await msg.channel.send(`Role restoration complete. Restored ${restored} roles, skipped ${skipped} existing roles.`);
	}
	
	async restoreChannels(guild, channels, msg) {
		let restoredCategories = 0;
		let restoredChannels = 0;
		let skipped = 0;
		
		// First pass: Create categories
		const categoryChannels = channels.filter(c => c.type === 4);
		const categoryMap = {}; // Map old category IDs to new ones
		
		for (const category of categoryChannels) {
			try {
				// Check if category with same name already exists
				const existingCategory = guild.channels.cache.find(c => c.name === category.name && c.type === 4);
				
				if (existingCategory) {
					categoryMap[category.id] = existingCategory.id;
					skipped++;
					continue;
				}
				
				const newCategory = await guild.channels.create({
					name: category.name,
					type: 4,
					position: category.position
				});
				
				categoryMap[category.id] = newCategory.id;
				restoredCategories++;
				
			} catch (error) {
				this.client.logger.error(`Failed to restore category ${category.name}: ${error}`);
			}
		}
		
		// Second pass: Create other channels
		const nonCategoryChannels = channels.filter(c => c.type !== 4);
		
		for (const channel of nonCategoryChannels) {
			try {
				// Check if channel with same name already exists in the same category
				const parentId = channel.parentId ? categoryMap[channel.parentId] : null;
				const existingChannel = guild.channels.cache.find(
					c => c.name === channel.name && 
					c.type === channel.type && 
					c.parentId === parentId
				);
				
				if (existingChannel) {
					skipped++;
					continue;
				}
				
				// Create channel based on type
				const channelOptions = {
					name: channel.name,
					type: channel.type,
					parent: parentId
				};
				
				// Add type-specific options
				if (channel.type === 0) { // Text channel
					channelOptions.topic = channel.topic;
					channelOptions.nsfw = channel.nsfw;
					channelOptions.rateLimitPerUser = channel.rateLimitPerUser;
				} else if (channel.type === 2) { // Voice channel
					channelOptions.bitrate = channel.bitrate;
					channelOptions.userLimit = channel.userLimit;
				}
				
				await guild.channels.create(channelOptions);
				restoredChannels++;
				
				// Throttle to avoid rate limits
				if (restoredChannels % 5 === 0) {
					await new Promise(resolve => setTimeout(resolve, 5000));
					await msg.channel.send(`Restored ${restoredChannels} channels so far...`);
				}
				
			} catch (error) {
				this.client.logger.error(`Failed to restore channel ${channel.name}: ${error}`);
			}
		}
		
		await msg.channel.send(`Channel restoration complete. Restored ${restoredCategories} categories and ${restoredChannels} channels, skipped ${skipped} existing channels.`);
	}
}; 