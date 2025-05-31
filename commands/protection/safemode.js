const Command = require('../../framework/Command');
const { PermissionFlagsBits, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = class SafeModeCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'safemode',
			group: 'protection',
			description: 'Enable or disable server lockdown (safe mode) during attacks',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['enable', 'disable', 'status'],
					prompt: 'Would you like to enable, disable, or check the status of safe mode?',
					default: 'status'
				},
				{
					key: 'level',
					type: 'integer',
					min: 1,
					max: 3,
					prompt: 'What security level to apply? (1-3, where 3 is most restrictive)',
					default: 1
				},
				{
					key: 'reason',
					type: 'string',
					prompt: 'What is the reason for enabling safe mode?',
					default: 'Security precaution'
				}
			]
		});
	}

	async run(msg, { action, level, reason }) {
		try {
			const guildId = msg.guild.id;
			const safeModeKey = `protection:${guildId}:safemode`;
			
			if (action === 'status') {
				const safeModeData = await this.client.redis.db.hgetall(safeModeKey) || {};
				const isEnabled = safeModeData.enabled === '1';
				
				const embed = new EmbedBuilder()
					.setTitle('🔒 Safe Mode Status')
					.setColor(isEnabled ? 0xE74C3C : 0x00AE86)
					.setDescription(`Safe mode is currently **${isEnabled ? 'ENABLED' : 'DISABLED'}**`)
					.setFooter({ text: 'Safe mode restricts server access during security threats' });
				
				if (isEnabled) {
					embed.addFields(
						{ name: 'Security Level', value: safeModeData.level || '1', inline: true },
						{ name: 'Enabled By', value: safeModeData.enabledBy || 'Unknown', inline: true },
						{ name: 'Reason', value: safeModeData.reason || 'Not specified', inline: false },
						{ name: 'Enabled At', value: new Date(parseInt(safeModeData.timestamp || Date.now())).toLocaleString(), inline: true },
						{ name: 'Disable Command', value: '`safemode disable`', inline: false }
					);
				}
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'enable') {
				// Check if already enabled
				const currentlyEnabled = await this.client.redis.db.hget(safeModeKey, 'enabled') === '1';
				const currentLevel = parseInt(await this.client.redis.db.hget(safeModeKey, 'level') || '0');
				
				if (currentlyEnabled && currentLevel >= level) {
					return msg.reply(`Safe mode is already enabled at level ${currentLevel}. Use a higher level or disable first.`);
				}
				
				// Store the original permissions of each channel before modifying them
				if (!currentlyEnabled) {
					const channelPermissions = {};
					for (const channel of msg.guild.channels.cache.values()) {
						try {
							const overwrites = channel.permissionOverwrites.cache.map(overwrite => ({
								id: overwrite.id,
								type: overwrite.type,
								allow: overwrite.allow.toString(),
								deny: overwrite.deny.toString()
							}));
							
							channelPermissions[channel.id] = JSON.stringify(overwrites);
						} catch (error) {
							this.client.logger.error(`Failed to backup permissions for channel ${channel.id}: ${error}`);
						}
					}
					await this.client.redis.db.hset(`${safeModeKey}:backups`, 'channelPermissions', JSON.stringify(channelPermissions));
				}
				
				// Start safemode
				await this.client.redis.db.hset(safeModeKey, 'enabled', '1');
				await this.client.redis.db.hset(safeModeKey, 'level', level.toString());
				await this.client.redis.db.hset(safeModeKey, 'enabledBy', `${msg.author.tag} (${msg.author.id})`);
				await this.client.redis.db.hset(safeModeKey, 'reason', reason);
				await this.client.redis.db.hset(safeModeKey, 'timestamp', Date.now().toString());
				
				// Apply restrictions based on level
				await this.applySafeModeRestrictions(msg.guild, level, msg);
				
				// Log to protection log channel
				await this.logSafeModeAction(msg.guild, 'enabled', level, reason, msg.author);
				
				return msg.reply(`✅ Safe mode has been enabled at level ${level}. The server is now in lockdown mode.`);
			}
			
			else if (action === 'disable') {
				const safeModeData = await this.client.redis.db.hgetall(safeModeKey) || {};
				const isEnabled = safeModeData.enabled === '1';
				
				if (!isEnabled) {
					return msg.reply('Safe mode is not currently enabled.');
				}
				
				// Restore permissions
				await this.disableSafeMode(msg.guild, msg);
				
				// Update database
				await this.client.redis.db.hset(safeModeKey, 'enabled', '0');
				
				// Log to protection log channel
				await this.logSafeModeAction(msg.guild, 'disabled', 0, reason, msg.author);
				
				return msg.reply('✅ Safe mode has been disabled. Server permissions have been restored.');
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} safe mode: ${err.message}`);
		}
	}
	
	async applySafeModeRestrictions(guild, level, msg) {
		await msg.channel.send(`🔒 Applying level ${level} restrictions to ${guild.channels.cache.size} channels...`);
		let count = 0;
		
		// The everyone role
		const everyoneRole = guild.roles.everyone;
		
		// Apply restrictions to all channels based on level
		for (const channel of guild.channels.cache.values()) {
			try {
				const perms = new PermissionsBitField();
				
				// Level 1: Prevent sending messages, adding reactions, and using voice
				if (level >= 1) {
					perms.add(PermissionFlagsBits.SendMessages);
					perms.add(PermissionFlagsBits.AddReactions);
					perms.add(PermissionFlagsBits.Connect);
				}
				
				// Level 2: Also prevent embedding links, attaching files
				if (level >= 2) {
					perms.add(PermissionFlagsBits.EmbedLinks);
					perms.add(PermissionFlagsBits.AttachFiles);
					perms.add(PermissionFlagsBits.CreatePublicThreads);
					perms.add(PermissionFlagsBits.CreatePrivateThreads);
				}
				
				// Level 3: Complete lockdown, prevent view channel
				if (level >= 3) {
					perms.add(PermissionFlagsBits.ViewChannel);
				}
				
				await channel.permissionOverwrites.edit(everyoneRole, {
					[PermissionFlagsBits.SendMessages]: level >= 1 ? false : null,
					[PermissionFlagsBits.AddReactions]: level >= 1 ? false : null,
					[PermissionFlagsBits.Connect]: level >= 1 ? false : null,
					[PermissionFlagsBits.EmbedLinks]: level >= 2 ? false : null,
					[PermissionFlagsBits.AttachFiles]: level >= 2 ? false : null,
					[PermissionFlagsBits.CreatePublicThreads]: level >= 2 ? false : null,
					[PermissionFlagsBits.CreatePrivateThreads]: level >= 2 ? false : null,
					[PermissionFlagsBits.ViewChannel]: level >= 3 ? false : null
				});
				
				count++;
				if (count % 10 === 0) {
					await new Promise(resolve => setTimeout(resolve, 2000)); // Avoid rate limits
				}
			} catch (error) {
				this.client.logger.error(`Failed to apply safe mode to channel ${channel.id}: ${error}`);
			}
		}
		
		// Exempt trusted roles from restrictions
		const bypassRolesData = await this.client.redis.db.hgetall(`protection:${guild.id}:rolebypass`) || {};
		for (const [key, value] of Object.entries(bypassRolesData)) {
			if (key.endsWith(':all') || key.endsWith(':safemode')) {
				const roleId = key.split(':')[0];
				try {
					const role = await guild.roles.fetch(roleId);
					
					// Update channels to exempt this role
					for (const channel of guild.channels.cache.values()) {
						await channel.permissionOverwrites.edit(role, {
							[PermissionFlagsBits.SendMessages]: true,
							[PermissionFlagsBits.AddReactions]: true,
							[PermissionFlagsBits.Connect]: true,
							[PermissionFlagsBits.EmbedLinks]: true,
							[PermissionFlagsBits.AttachFiles]: true,
							[PermissionFlagsBits.CreatePublicThreads]: true,
							[PermissionFlagsBits.CreatePrivateThreads]: true,
							[PermissionFlagsBits.ViewChannel]: true
						});
					}
				} catch (error) {
					this.client.logger.error(`Failed to exempt role ${roleId} from safe mode: ${error}`);
				}
			}
		}
		
		await msg.channel.send(`Lockdown complete. Modified ${count} channels.`);
	}
	
	async disableSafeMode(guild, msg) {
		await msg.channel.send('🔓 Disabling safe mode and restoring permissions...');
		
		try {
			// Get the backup of channel permissions
			const safeModeKey = `protection:${guild.id}:safemode`;
			const backupData = await this.client.redis.db.hget(`${safeModeKey}:backups`, 'channelPermissions');
			
			if (!backupData) {
				// If no backup exists, just remove the restrictions
				const everyoneRole = guild.roles.everyone;
				for (const channel of guild.channels.cache.values()) {
					try {
						await channel.permissionOverwrites.edit(everyoneRole, {
							[PermissionFlagsBits.SendMessages]: null,
							[PermissionFlagsBits.AddReactions]: null,
							[PermissionFlagsBits.Connect]: null,
							[PermissionFlagsBits.EmbedLinks]: null,
							[PermissionFlagsBits.AttachFiles]: null,
							[PermissionFlagsBits.CreatePublicThreads]: null,
							[PermissionFlagsBits.CreatePrivateThreads]: null,
							[PermissionFlagsBits.ViewChannel]: null
						});
					} catch (error) {
						this.client.logger.error(`Failed to restore permissions for channel ${channel.id}: ${error}`);
					}
				}
				return;
			}
			
			// Restore from backup
			const channelPermissions = JSON.parse(backupData);
			
			for (const [channelId, permissionsJSON] of Object.entries(channelPermissions)) {
				try {
					const channel = await guild.channels.fetch(channelId);
					if (!channel) continue;
					
					const overwrites = JSON.parse(permissionsJSON);
					
					// Clear existing overwrites first
					for (const overwrite of channel.permissionOverwrites.cache.values()) {
						await overwrite.delete();
					}
					
					// Restore original overwrites
					for (const overwrite of overwrites) {
						await channel.permissionOverwrites.create(
							overwrite.id,
							{
								...this.convertPermissionsToObject(BigInt(overwrite.allow), true),
								...this.convertPermissionsToObject(BigInt(overwrite.deny), false)
							}
						);
					}
				} catch (error) {
					this.client.logger.error(`Failed to restore permissions for channel ${channelId}: ${error}`);
				}
			}
			
			// Clear the backup data after successful restore
			await this.client.redis.db.hdel(`${safeModeKey}:backups`, 'channelPermissions');
			
		} catch (error) {
			throw new Error(`Failed to restore permissions: ${error.message}`);
		}
	}
	
	convertPermissionsToObject(bitfield, value) {
		const permObject = {};
		for (const [name, bit] of Object.entries(PermissionFlagsBits)) {
			if (bitfield & BigInt(bit)) {
				permObject[bit] = value;
			}
		}
		return permObject;
	}
	
	async logSafeModeAction(guild, action, level, reason, author) {
		try {
			const logChannelId = await this.client.redis.db.get(`protection:${guild.id}:logchannel`);
			if (!logChannelId) return;
			
			const logChannel = await guild.channels.fetch(logChannelId);
			if (!logChannel) return;
			
			const embed = new EmbedBuilder()
				.setTitle(`🔒 Safe Mode ${action === 'enabled' ? 'Enabled' : 'Disabled'}`)
				.setColor(action === 'enabled' ? 0xE74C3C : 0x00AE86)
				.setDescription(`Server safe mode has been ${action}`)
				.addFields(
					{ name: 'Action By', value: `${author.tag} (${author.id})`, inline: true }
				)
				.setTimestamp();
			
			if (action === 'enabled') {
				embed.addFields(
					{ name: 'Security Level', value: level.toString(), inline: true },
					{ name: 'Reason', value: reason, inline: false }
				);
			}
			
			await logChannel.send({ embeds: [embed] });
		} catch (error) {
			this.client.logger.error(`Failed to log safe mode action: ${error}`);
		}
	}
}; 