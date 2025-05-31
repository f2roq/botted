const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class WarnLimitCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'warnlimit',
			group: 'protection',
			description: 'Set maximum warning limits and actions to take when user warnings exceed the limit',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['set', 'view', 'clear'],
					prompt: 'What would you like to do? (set/view/clear)',
					default: 'view'
				},
				{
					key: 'limit',
					type: 'integer',
					min: 1,
					max: 10,
					prompt: 'How many warnings should trigger the action? (1-10)',
					default: 0
				},
				{
					key: 'response',
					type: 'string',
					oneOf: ['ban', 'kick', 'mute', 'none'],
					prompt: 'What action should be taken when the limit is reached? (ban/kick/mute/none)',
					default: 'none'
				},
				{
					key: 'duration',
					type: 'string',
					prompt: 'How long should the action last? (e.g., "1h", "1d", "permanent" - only for mute/ban)',
					default: 'permanent'
				}
			]
		});
	}

	async run(msg, { action, limit, response, duration }) {
		try {
			const guildId = msg.guild.id;
			const warnLimitKey = `protection:${guildId}:warnlimit`;
			const warnSettingsKey = `protection:${guildId}:warnsettings`;
			
			if (action === 'view') {
				// Get current warn limit settings
				const currentLimit = await this.client.redis.db.get(warnLimitKey);
				const settings = await this.client.redis.db.hgetall(warnSettingsKey) || {};
				
				const embed = new EmbedBuilder()
					.setTitle('⚠️ Warning Limit Settings')
					.setColor(0x00AE86)
					.setDescription('Current settings for warning limit automation');
				
				if (!currentLimit) {
					embed.addFields({ name: 'Status', value: 'Warning limit automation is not configured', inline: false });
				} else {
					embed.addFields(
						{ name: 'Warning Limit', value: currentLimit, inline: true },
						{ name: 'Action', value: settings.action || 'none', inline: true }
					);
					
					if (settings.duration) {
						embed.addFields({ 
							name: 'Duration', 
							value: settings.duration === 'permanent' ? 'Permanent' : settings.duration, 
							inline: true 
						});
					}
				}
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'clear') {
				// Clear warn limit settings
				await this.client.redis.db.del(warnLimitKey);
				await this.client.redis.db.del(warnSettingsKey);
				
				return msg.reply('Warning limit automation has been disabled.');
			}
			
			else if (action === 'set') {
				if (limit === 0) {
					return msg.reply('Please specify a warning limit between 1 and 10.');
				}
				
				// Set warn limit
				await this.client.redis.db.set(warnLimitKey, limit.toString());
				
				// Set action
				await this.client.redis.db.hset(warnSettingsKey, 'action', response);
				
				// Set duration if applicable
				if (response === 'mute' || response === 'ban') {
					await this.client.redis.db.hset(warnSettingsKey, 'duration', duration);
				}
				
				// Determine message based on action
				let responseMessage;
				switch (response) {
					case 'ban':
						responseMessage = `the user will be banned${duration !== 'permanent' ? ` for ${duration}` : ' permanently'}`;
						break;
					case 'kick':
						responseMessage = 'the user will be kicked';
						break;
					case 'mute':
						responseMessage = `the user will be muted${duration !== 'permanent' ? ` for ${duration}` : ' permanently'}`;
						break;
					case 'none':
						responseMessage = 'no action will be taken (only logging)';
						break;
					default:
						responseMessage = `action "${response}" will be taken`;
				}
				
				return msg.reply(`Warning limit set to ${limit}. When a user reaches this many warnings, ${responseMessage}.`);
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} warning limit: ${err.message}`);
		}
	}
}; 