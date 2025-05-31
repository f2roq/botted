const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class DashboardCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'dashboard',
			aliases: ['control', 'panel', 'security'],
			group: 'protection',
			description: 'View the comprehensive security dashboard for the server',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.ManageGuild]
		});
	}

	async run(msg) {
		try {
			const guildId = msg.guild.id;
			const protectionKey = `protection:${guildId}`;
			
			// Get main protection settings
			const settings = await this.client.redis.db.hgetall(protectionKey) || {};
			const isEnabled = settings.enabled === '1';
			
			// Get log channel
			const logChannelId = await this.client.redis.db.get(`${protectionKey}:logchannel`);
			let logChannelText = 'Not set';
			if (logChannelId) {
				try {
					const logChannel = await this.client.channels.fetch(logChannelId);
					logChannelText = `<#${logChannel.id}> (${logChannel.name})`;
				} catch (error) {
					logChannelText = 'Invalid channel';
				}
			}
			
			// Get notification settings
			const notifySettings = await this.client.redis.db.hgetall(`${protectionKey}:notify`) || {};
			const notificationsEnabled = Object.values(notifySettings).some(val => val === '1');
			
			// Get trusted users count
			const trustedUsers = await this.client.redis.db.smembers(`${protectionKey}:trusted`);
			
			// Get limit settings
			const limits = await this.client.redis.db.hgetall(`${protectionKey}:limits`) || {};
			
			// Get warn limit
			const warnLimit = await this.client.redis.db.get(`${protectionKey}:warnlimit`) || 'Not set';
			
			// Get ban limit
			const banLimit = await this.client.redis.db.get(`${protectionKey}:banlimit`) || 'Not set';
			
			// Get kick limit
			const kickLimit = await this.client.redis.db.get(`${protectionKey}:kicklimit`) || 'Not set';
			
			// Check safemode status
			const safeModeData = await this.client.redis.db.hgetall(`${protectionKey}:safemode`) || {};
			const safeModeEnabled = safeModeData.enabled === '1';
			
			// Get spam settings
			const spamSettings = await this.client.redis.db.hgetall(`${protectionKey}:spam`) || {};
			
			// Get role bypass count
			const bypassRoles = await this.client.redis.db.hgetall(`${protectionKey}:rolebypass`) || {};
			const roleBypassCount = Object.keys(bypassRoles).length;
			
			// Get antiword list count
			const antiwordList = await this.client.redis.db.smembers(`${protectionKey}:antiword`) || [];
			
			// Get link whitelist count
			const linkWhitelist = await this.client.redis.db.smembers(`${protectionKey}:linkwhitelist`) || [];
			
			// Get deletion monitor status
			const deletionMonitorEnabled = await this.client.redis.db.get(`${protectionKey}:deletionmonitor`) === '1';
			
			// Get deleted items count
			const deletedItems = await this.client.redis.db.hgetall(`${protectionKey}:deleted`) || {};
			const deletedItemsCount = Object.keys(deletedItems).length;
			
			// Build the embed for overview
			const embed = new EmbedBuilder()
				.setTitle('🛡️ Server Protection Dashboard')
				.setColor(isEnabled ? 0x00AE86 : 0xE74C3C)
				.setDescription(`Protection system is currently **${isEnabled ? 'ENABLED' : 'DISABLED'}**\n\nUse the corresponding commands to configure each aspect of the protection system.`)
				.setThumbnail(msg.guild.iconURL({ dynamic: true }))
				.addFields(
					{ 
						name: '🔧 Core Settings', 
						value: [
							`**Status**: ${isEnabled ? '✅ Enabled' : '❌ Disabled'}`,
							`**Log Channel**: ${logChannelText}`,
							`**Notifications**: ${notificationsEnabled ? '✅ Enabled' : '❌ Disabled'}`,
							`**Trusted Users**: ${trustedUsers.length}`,
							`**Role Bypasses**: ${roleBypassCount}`
						].join('\n'),
						inline: false
					},
					{
						name: '⚠️ Security Limits',
						value: [
							`**Warn Limit**: ${warnLimit}`,
							`**Ban Limit**: ${banLimit}`,
							`**Kick Limit**: ${kickLimit}`,
							`**Channel Create Limit**: ${limits.channel || 'Not set'}`,
							`**Role Create Limit**: ${limits.role || 'Not set'}`
						].join('\n'),
						inline: true
					},
					{
						name: '🔒 Protection Status',
						value: [
							`**Safe Mode**: ${safeModeEnabled ? `✅ Level ${safeModeData.level || '1'}` : '❌ Disabled'}`,
							`**Spam Protection**: ${spamSettings.enabled === '1' ? '✅ Enabled' : '❌ Disabled'}`,
							`**Word Filter**: ${antiwordList.length} blocked words`,
							`**Link Whitelist**: ${linkWhitelist.length} allowed domains`,
							`**Deletion Monitor**: ${deletionMonitorEnabled ? '✅ Enabled' : '❌ Disabled'}`,
							`**Recoverable Items**: ${deletedItemsCount}`
						].join('\n'),
						inline: true
					}
				);
			
			// Get module settings and categorize them
			const moduleCategories = {
				'User Protection': ['antijoin', 'antibots', 'bblack', 'verifybot', 'watchdog', 'threatscore'],
				'Server Structure': ['antidelete', 'antiperms', 'antiedit', 'rolefreeze', 'safemode'],
				'Content Filtering': ['antilinks', 'antiword', 'antiemoji', 'antiinvite'],
				'Anti-Raid': ['antiraid', 'smartban', 'decay', 'autocleanup']
			};
			
			// Add module status fields
			for (const [category, modules] of Object.entries(moduleCategories)) {
				const moduleStatus = modules.map(mod => {
					const status = settings[mod] === '1';
					return `${status ? '✅' : '❌'} ${mod}`;
				}).join('\n');
				
				embed.addFields({
					name: `📋 ${category}`,
					value: moduleStatus || 'No modules configured',
					inline: true
				});
			}
			
			// Add configuration commands field
			embed.addFields({
				name: '🔗 Configuration Commands',
				value: [
					'`protection` - Toggle global protection',
					'`module` - Configure protection modules',
					'`logchannel` - Set logging channel',
					'`notify` - Configure notifications',
					'`trustuser` - Manage trusted users',
					'`rolebypass` - Set role exemptions',
					'`setkick` - Configure kick limits',
					'`setban` - Configure ban limits',
					'`antiword` - Manage blocked words',
					'`antilinks` - Configure link filtering',
					'`backup` - Manage server backups',
					'`threatscore` - Analyze user risk',
					'`undo` - Restore deleted elements',
					'`deletionmonitor` - Track deleted elements'
				].join('\n'),
				inline: false
			});
			
			// Send the dashboard
			return msg.reply({ embeds: [embed] });
			
		} catch (err) {
			return msg.reply(`Failed to load protection dashboard: ${err.message}`);
		}
	}
}; 