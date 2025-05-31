const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class SetBanCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'setban',
			group: 'protection',
			description: 'Set maximum ban limits and actions to take when limits are exceeded',
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
					max: 100,
					prompt: 'How many bans should trigger the action? (1-100)',
					default: 0
				},
				{
					key: 'response',
					type: 'string',
					oneOf: ['ban', 'kick', 'mute', 'removerole', 'none'],
					prompt: 'What action should be taken when the limit is reached? (ban/kick/mute/removerole/none)',
					default: 'none'
				},
				{
					key: 'roleId',
					type: 'role',
					prompt: 'Which role should be removed? (Only required if response is "removerole")',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, limit, response, roleId }) {
		try {
			const guildId = msg.guild.id;
			const banLimitKey = `protection:${guildId}:banlimit`;
			const banSettingsKey = `protection:${guildId}:bansettings`;
			
			if (action === 'view') {
				// Get current ban limit settings
				const currentLimit = await this.client.redis.db.get(banLimitKey);
				const settings = await this.client.redis.db.hgetall(banSettingsKey) || {};
				
				const embed = new EmbedBuilder()
					.setTitle('⚠️ Ban Limit Settings')
					.setColor(0x00AE86)
					.setDescription('Current settings for ban limit protection');
				
				if (!currentLimit) {
					embed.addFields({ name: 'Status', value: 'Ban limit protection is not configured', inline: false });
				} else {
					embed.addFields(
						{ name: 'Ban Limit', value: currentLimit, inline: true },
						{ name: 'Action', value: settings.action || 'none', inline: true }
					);
					
					if (settings.action === 'removerole' && settings.roleId) {
						try {
							const role = await msg.guild.roles.fetch(settings.roleId);
							embed.addFields({ name: 'Role to Remove', value: `${role.name} (${role.id})`, inline: true });
						} catch (error) {
							embed.addFields({ name: 'Role to Remove', value: `Unknown role (${settings.roleId})`, inline: true });
						}
					}
				}
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'clear') {
				// Clear ban limit settings
				await this.client.redis.db.del(banLimitKey);
				await this.client.redis.db.del(banSettingsKey);
				
				return msg.reply('Ban limit protection has been disabled.');
			}
			
			else if (action === 'set') {
				if (limit === 0) {
					return msg.reply('Please specify a ban limit between 1 and 100.');
				}
				
				// Set ban limit
				await this.client.redis.db.set(banLimitKey, limit.toString());
				
				// Set action
				await this.client.redis.db.hset(banSettingsKey, 'action', response);
				
				// If removing a role, store the role ID
				if (response === 'removerole') {
					if (!roleId) {
						return msg.reply('You must specify a role to remove when using the "removerole" action.');
					}
					
					await this.client.redis.db.hset(banSettingsKey, 'roleId', roleId.id);
					
					return msg.reply(`Ban limit set to ${limit}. When reached, the role ${roleId.name} will be removed from the moderator.`);
				}
				
				// Determine message based on action
				let responseMessage;
				switch (response) {
					case 'ban':
						responseMessage = 'the moderator will be banned';
						break;
					case 'kick':
						responseMessage = 'the moderator will be kicked';
						break;
					case 'mute':
						responseMessage = 'the moderator will be muted';
						break;
					case 'none':
						responseMessage = 'no action will be taken (only logging)';
						break;
					default:
						responseMessage = `action "${response}" will be taken`;
				}
				
				return msg.reply(`Ban limit set to ${limit}. When reached, ${responseMessage}.`);
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} ban limit: ${err.message}`);
		}
	}
}; 