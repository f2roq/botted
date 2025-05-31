const Command = require('../../framework/Command');
const { PermissionFlagsBits, Events } = require('discord.js');

module.exports = class DeletionMonitorCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'deletionmonitor',
			aliases: ['trackdeletions', 'monitor'],
			group: 'protection',
			description: 'Enable or disable tracking of deleted channels and roles',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['enable', 'disable', 'status'],
					prompt: 'What would you like to do? (enable/disable/status)',
					default: 'status'
				}
			]
		});

		// Set up event listeners when the command is first initialized
		this.setupListeners();
	}

	setupListeners() {
		// Channel delete event
		this.client.on(Events.ChannelDelete, async (channel) => {
			try {
				if (!channel.guild) return; // Ignore DM channels
				
				const guildId = channel.guild.id;
				const monitorKey = `protection:${guildId}:deletionmonitor`;
				const isEnabled = await this.client.redis.db.get(monitorKey) === '1';
				
				// Only track if enabled for this guild
				if (!isEnabled) return;
				
				const deletedKey = `protection:${guildId}:deleted`;
				const timestamp = Date.now();
				
				// Determine channel type
				let type;
				switch (channel.type) {
					case 4: // Guild Category
						type = 'category';
						break;
					case 0: // Guild Text
						type = 'text';
						break;
					case 2: // Guild Voice
						type = 'voice';
						break;
					default:
						return; // Ignore other types
				}
				
				// Create data object for this channel
				const channelData = {
					name: channel.name,
					position: channel.position,
					permissionOverwrites: channel.permissionOverwrites ? 
						Array.from(channel.permissionOverwrites.cache.values()) : [],
					parentId: channel.parentId
				};
				
				// Add type-specific properties
				if (type === 'text') {
					channelData.topic = channel.topic;
					channelData.nsfw = channel.nsfw;
					channelData.rateLimitPerUser = channel.rateLimitPerUser;
				} else if (type === 'voice') {
					channelData.bitrate = channel.bitrate;
					channelData.userLimit = channel.userLimit;
				}
				
				// Store in Redis with expiration (7 days)
				const key = `${type}:${channel.id}:${timestamp}`;
				await this.client.redis.db.hset(deletedKey, key, JSON.stringify(channelData));
				
				// Log to monitoring channel if one is set
				await this.logDeletion(channel.guild, type, channel.name);
			} catch (error) {
				this.client.logger.error(`Error tracking deleted channel: ${error}`);
			}
		});
		
		// Role delete event
		this.client.on(Events.GuildRoleDelete, async (role) => {
			try {
				const guildId = role.guild.id;
				const monitorKey = `protection:${guildId}:deletionmonitor`;
				const isEnabled = await this.client.redis.db.get(monitorKey) === '1';
				
				// Only track if enabled for this guild
				if (!isEnabled) return;
				
				const deletedKey = `protection:${guildId}:deleted`;
				const timestamp = Date.now();
				
				// Create data object for this role
				const roleData = {
					name: role.name,
					color: role.hexColor,
					hoist: role.hoist,
					position: role.position,
					permissions: role.permissions.toString(),
					mentionable: role.mentionable
				};
				
				// Store in Redis with expiration (7 days)
				const key = `role:${role.id}:${timestamp}`;
				await this.client.redis.db.hset(deletedKey, key, JSON.stringify(roleData));
				
				// Log to monitoring channel if one is set
				await this.logDeletion(role.guild, 'role', role.name);
			} catch (error) {
				this.client.logger.error(`Error tracking deleted role: ${error}`);
			}
		});
	}

	async run(msg, { action }) {
		try {
			const guildId = msg.guild.id;
			const monitorKey = `protection:${guildId}:deletionmonitor`;
			
			if (action === 'status') {
				const isEnabled = await this.client.redis.db.get(monitorKey) === '1';
				return msg.reply(`Deletion monitoring is currently **${isEnabled ? 'enabled' : 'disabled'}** for this server.`);
			} 
			else if (action === 'enable') {
				await this.client.redis.db.set(monitorKey, '1');
				return msg.reply('Deletion monitoring has been enabled. The bot will now track deleted channels and roles for recovery with the `undo` command.');
			} 
			else if (action === 'disable') {
				await this.client.redis.db.set(monitorKey, '0');
				return msg.reply('Deletion monitoring has been disabled. The bot will no longer track deleted elements.');
			}
		} catch (err) {
			return msg.reply(`Failed to ${action} deletion monitoring: ${err.message}`);
		}
	}
	
	async logDeletion(guild, type, name) {
		try {
			const logChannelId = await this.client.redis.db.get(`protection:${guild.id}:logchannel`);
			if (!logChannelId) return;
			
			const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
			if (!logChannel) return;
			
			const typeMap = {
				'category': 'Category',
				'text': 'Text Channel',
				'voice': 'Voice Channel',
				'role': 'Role'
			};
			
			const typeEmoji = {
				'category': '📁',
				'text': '💬',
				'voice': '🔊',
				'role': '🏷️'
			};
			
			await logChannel.send({
				embeds: [{
					title: `${typeEmoji[type]} ${typeMap[type]} Deleted`,
					description: `A ${typeMap[type].toLowerCase()} named **${name}** was deleted and has been saved for recovery.`,
					color: 0xE74C3C,
					fields: [
						{ name: 'Recovery Command', value: `\`undo ${type} ${name}\``, inline: true }
					],
					footer: { text: 'Use the undo command to restore this element' },
					timestamp: new Date()
				}]
			});
		} catch (error) {
			this.client.logger.error(`Failed to log deletion: ${error}`);
		}
	}
}; 