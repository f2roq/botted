const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = class UndoCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'undo',
			aliases: ['restore', 'recover'],
			group: 'protection',
			description: 'Restore recently deleted categories, channels, or roles',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'type',
					type: 'string',
					oneOf: ['category', 'text', 'voice', 'role', 'list'],
					prompt: 'What type of element would you like to restore? (category/text/voice/role/list)',
					default: 'list'
				},
				{
					key: 'name',
					type: 'string',
					prompt: 'What is the name of the element you want to restore?',
					default: ''
				}
			]
		});
	}

	async run(msg, { type, name }) {
		try {
			const guildId = msg.guild.id;
			const deletedKey = `protection:${guildId}:deleted`;
			
			// List all recently deleted elements
			if (type === 'list') {
				const deletedItems = await this.client.redis.db.hgetall(deletedKey) || {};
				
				if (Object.keys(deletedItems).length === 0) {
					return msg.reply('No recently deleted elements found in the database.');
				}
				
				const categorized = {
					category: [],
					text: [],
					voice: [],
					role: []
				};
				
				// Parse and categorize items
				for (const [key, value] of Object.entries(deletedItems)) {
					try {
						const [itemType, itemId, timestamp] = key.split(':');
						const data = JSON.parse(value);
						
						// Skip if older than 7 days (604800000 ms)
						if (Date.now() - parseInt(timestamp) > 604800000) {
							// Clean up old entries
							await this.client.redis.db.hdel(deletedKey, key);
							continue;
						}
						
						categorized[itemType].push({
							id: itemId,
							name: data.name,
							timestamp: parseInt(timestamp),
							data
						});
					} catch (error) {
						// Ignore malformed data
						continue;
					}
				}
				
				// Create embed
				const embed = new EmbedBuilder()
					.setTitle('🔄 Recently Deleted Elements')
					.setColor(0x00AE86)
					.setDescription('List of elements that can be restored with the `undo` command.\nElements are kept for 7 days after deletion.');
				
				// Add fields for each category
				for (const [category, items] of Object.entries(categorized)) {
					if (items.length > 0) {
						// Sort by most recent first
						items.sort((a, b) => b.timestamp - a.timestamp);
						
						const itemList = items.map(item => {
							const date = new Date(item.timestamp);
							return `**${item.name}** (deleted <t:${Math.floor(item.timestamp / 1000)}:R>)`;
						}).join('\n');
						
						embed.addFields({
							name: `${this.getTypeEmoji(category)} ${this.capitalizeFirstLetter(category)}s (${items.length})`,
							value: itemList.substring(0, 1024) || 'None',
							inline: false
						});
					}
				}
				
				// Add usage instructions
				embed.addFields({
					name: '📋 Usage',
					value: [
						'`undo category <name>` - Restore a deleted category',
						'`undo text <name>` - Restore a deleted text channel',
						'`undo voice <name>` - Restore a deleted voice channel',
						'`undo role <name>` - Restore a deleted role'
					].join('\n'),
					inline: false
				});
				
				return msg.reply({ embeds: [embed] });
			}
			
			// Restore a specific element
			else {
				if (!name) {
					return msg.reply(`Please specify the name of the ${type} to restore.`);
				}
				
				// Find the most recently deleted item of the specified type and name
				const deletedItems = await this.client.redis.db.hgetall(deletedKey) || {};
				let targetItem = null;
				let targetKey = null;
				
				for (const [key, value] of Object.entries(deletedItems)) {
					try {
						const [itemType, itemId, timestamp] = key.split(':');
						if (itemType === type) {
							const data = JSON.parse(value);
							if (data.name.toLowerCase() === name.toLowerCase() || data.name.toLowerCase().includes(name.toLowerCase())) {
								if (!targetItem || parseInt(timestamp) > targetItem.timestamp) {
									targetItem = {
										id: itemId,
										timestamp: parseInt(timestamp),
										data: data
									};
									targetKey = key;
								}
							}
						}
					} catch (error) {
						// Ignore malformed data
						continue;
					}
				}
				
				if (!targetItem) {
					return msg.reply(`No recently deleted ${type} found with the name "${name}".`);
				}
				
				// Restore the item based on its type
				let restored = null;
				
				await msg.reply(`Attempting to restore ${type} "${targetItem.data.name}"...`);
				
				if (type === 'category') {
					restored = await this.restoreCategory(msg.guild, targetItem.data);
				} else if (type === 'text') {
					restored = await this.restoreTextChannel(msg.guild, targetItem.data);
				} else if (type === 'voice') {
					restored = await this.restoreVoiceChannel(msg.guild, targetItem.data);
				} else if (type === 'role') {
					restored = await this.restoreRole(msg.guild, targetItem.data);
				}
				
				if (restored) {
					// Remove the item from deleted items
					await this.client.redis.db.hdel(deletedKey, targetKey);
					
					return msg.reply(`✅ Successfully restored ${type} "${targetItem.data.name}".`);
				} else {
					return msg.reply(`Failed to restore ${type} "${targetItem.data.name}". Please check bot permissions.`);
				}
			}
			
		} catch (err) {
			return msg.reply(`Failed to restore deleted element: ${err.message}`);
		}
	}
	
	// Helper methods
	async restoreCategory(guild, data) {
		try {
			const category = await guild.channels.create({
				name: data.name,
				type: ChannelType.GuildCategory,
				position: data.position || 0,
				permissionOverwrites: data.permissionOverwrites || []
			});
			
			return category;
		} catch (error) {
			this.client.logger.error(`Failed to restore category: ${error}`);
			return null;
		}
	}
	
	async restoreTextChannel(guild, data) {
		try {
			const textChannel = await guild.channels.create({
				name: data.name,
				type: ChannelType.GuildText,
				topic: data.topic,
				nsfw: data.nsfw,
				rateLimitPerUser: data.rateLimitPerUser,
				position: data.position || 0,
				permissionOverwrites: data.permissionOverwrites || [],
				parent: data.parentId ? await this.findParentCategory(guild, data.parentId) : null
			});
			
			return textChannel;
		} catch (error) {
			this.client.logger.error(`Failed to restore text channel: ${error}`);
			return null;
		}
	}
	
	async restoreVoiceChannel(guild, data) {
		try {
			const voiceChannel = await guild.channels.create({
				name: data.name,
				type: ChannelType.GuildVoice,
				bitrate: data.bitrate,
				userLimit: data.userLimit,
				position: data.position || 0,
				permissionOverwrites: data.permissionOverwrites || [],
				parent: data.parentId ? await this.findParentCategory(guild, data.parentId) : null
			});
			
			return voiceChannel;
		} catch (error) {
			this.client.logger.error(`Failed to restore voice channel: ${error}`);
			return null;
		}
	}
	
	async restoreRole(guild, data) {
		try {
			const role = await guild.roles.create({
				name: data.name,
				color: data.color,
				hoist: data.hoist,
				position: data.position,
				permissions: BigInt(data.permissions || '0'),
				mentionable: data.mentionable
			});
			
			return role;
		} catch (error) {
			this.client.logger.error(`Failed to restore role: ${error}`);
			return null;
		}
	}
	
	async findParentCategory(guild, originalParentId) {
		// Try to find the original category
		try {
			return await guild.channels.fetch(originalParentId);
		} catch {
			// If original category is not found, return null
			return null;
		}
	}
	
	getTypeEmoji(type) {
		switch (type) {
			case 'category': return '📁';
			case 'text': return '💬';
			case 'voice': return '🔊';
			case 'role': return '🏷️';
			default: return '❓';
		}
	}
	
	capitalizeFirstLetter(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}
}; 