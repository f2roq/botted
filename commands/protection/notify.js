const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class NotifyCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'notify',
			group: 'protection',
			description: 'Configure notification settings for protection events',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'type',
					type: 'string',
					oneOf: ['dm', 'ping', 'view'],
					prompt: 'What type of notification would you like to configure? (dm/ping/view)',
					default: 'view'
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable this notification type?',
					default: ''
				},
				{
					key: 'severity',
					type: 'string',
					oneOf: ['all', 'high', 'medium', 'low'],
					prompt: 'For which severity level of events? (all/high/medium/low)',
					default: 'all'
				}
			]
		});
	}

	async run(msg, { type, action, severity }) {
		try {
			const guildId = msg.guild.id;
			const notifyKey = `protection:${guildId}:notify`;
			
			if (type === 'view') {
				// Get current notification settings
				const settings = await this.client.redis.db.hgetall(notifyKey) || {};
				
				const embed = new EmbedBuilder()
					.setTitle('🔔 Notification Settings')
					.setColor(0x00AE86)
					.setDescription('Current notification settings for protection events')
					.addFields(
						{ 
							name: '📱 DM Notifications', 
							value: this.formatNotificationStatus('dm', settings), 
							inline: false 
						},
						{ 
							name: '💬 Ping Notifications', 
							value: this.formatNotificationStatus('ping', settings), 
							inline: false 
						}
					);
				
				return msg.reply({ embeds: [embed] });
			}
			
			if (!action) {
				return msg.reply(`Please specify whether to enable or disable ${type} notifications.`);
			}
			
			// Set notification setting
			const key = `${type}_${severity}`;
			await this.client.redis.db.hset(notifyKey, key, action === 'enable' ? '1' : '0');
			
			// If enabling, check if admin has DM permissions enabled for the server
			if (type === 'dm' && action === 'enable' && !msg.member.dmChannel) {
				await msg.reply(`${type} notifications for ${severity} severity events have been ${action}d. Please note: You need to allow DMs from server members to receive these notifications.`);
			} else {
				await msg.reply(`${type} notifications for ${severity} severity events have been ${action}d.`);
			}
			
			// If this is the first notification setup, let's check if a log channel exists
			const logChannelId = await this.client.redis.db.get(`protection:${guildId}:logchannel`);
			if (!logChannelId) {
				await msg.reply('**Note:** You haven\'t set up a log channel yet. It\'s recommended to also set up a log channel with the `logchannel` command for complete protection coverage.');
			}
			
		} catch (err) {
			return msg.reply(`Failed to update notification settings: ${err.message}`);
		}
	}
	
	formatNotificationStatus(type, settings) {
		const severities = ['all', 'high', 'medium', 'low'];
		const statusLines = [];
		
		for (const severity of severities) {
			const key = `${type}_${severity}`;
			const status = settings[key] === '1';
			const emoji = status ? '✅' : '❌';
			
			let severityText = severity.charAt(0).toUpperCase() + severity.slice(1);
			if (severity === 'all') severityText = 'All Events';
			else if (severity === 'high') severityText = 'High Severity';
			else if (severity === 'medium') severityText = 'Medium Severity';
			else if (severity === 'low') severityText = 'Low Severity';
			
			statusLines.push(`${emoji} ${severityText}`);
		}
		
		return statusLines.join('\n') || 'No settings configured';
	}
}; 