const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class SetBanCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'setban',
			aliases: ['banlimit', 'ban-limit', 'set-ban-limit'],
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
					default: 'view',
					examples: ['set', 'view', 'clear']
				},
				{
					key: 'limit',
					type: 'integer',
					prompt: 'What is the maximum number of bans allowed?',
					default: 0,
					min: 1,
					max: 100,
					examples: [5, 10, 20]
				},
				{
					key: 'punishment',
					type: 'string',
					oneOf: ['ban', 'kick', 'mute', 'removerole', 'none'],
					prompt: 'What action should be taken when the limit is exceeded? (ban/kick/mute/removerole/none)',
					default: 'none',
					examples: ['ban', 'kick', 'mute', 'removerole']
				},
				{
					key: 'role',
					type: 'role',
					prompt: 'Which role should be removed? (Only required if punishment is "removerole")',
					default: '',
					examples: ['@Moderator', 'Admin']
				}
			]
		});
	}

	usage(argString) {
		return argString || `\`${this.client.commandPrefix}${this.name} [set|view|clear] [limit] [ban|kick|mute|removerole|none] [role]\``;
	}

	example(msg) {
		return [
			`${this.client.commandPrefix}${this.name} view`,
			`${this.client.commandPrefix}${this.name} set 5 kick`,
			`${this.client.commandPrefix}${this.name} set 10 removerole @Moderator`,
			`${this.client.commandPrefix}${this.name} clear`
		].join('\n');
	}

	async run(msg, { action, limit, punishment, role }) {
		try {
			const guildId = msg.guild.id;
			const banLimitKey = `protection:${guildId}:banlimit`;
			
			if (action === 'view') {
				const settings = await this.client.redis.db.hgetall(banLimitKey) || {};
				
				if (!settings.limit) {
					return msg.reply('No ban limit is currently set for this server.');
				}
				
				let responseText = `Current ban limit: **${settings.limit}** bans`;
				
				if (settings.punishment) {
					responseText += `\nPunishment: **${settings.punishment}**`;
					
					if (settings.punishment === 'removerole' && settings.roleId) {
						try {
							const targetRole = await msg.guild.roles.fetch(settings.roleId);
							responseText += ` (Role: **${targetRole.name}**)`;
						} catch (error) {
							responseText += ' (Role no longer exists)';
						}
					}
				}
				
				return msg.reply(responseText);
			}
			
			else if (action === 'set') {
				if (!limit) {
					return msg.reply('Please specify a ban limit (1-100).');
				}
				
				// Save limit
				await this.client.redis.db.hset(banLimitKey, 'limit', limit.toString());
				
				// Save punishment
				if (punishment) {
					await this.client.redis.db.hset(banLimitKey, 'punishment', punishment);
					
					// If punishment is removerole, save the role ID
					if (punishment === 'removerole') {
						if (!role) {
							return msg.reply('You must specify a role when using the "removerole" punishment.');
						}
						await this.client.redis.db.hset(banLimitKey, 'roleId', role.id);
					}
				}
				
				let responseText = `Ban limit has been set to **${limit}** bans`;
				
				if (punishment && punishment !== 'none') {
					responseText += `, with punishment: **${punishment}**`;
					
					if (punishment === 'removerole' && role) {
						responseText += ` (Role: **${role.name}**)`;
					}
				}
				
				return msg.reply(responseText);
			}
			
			else if (action === 'clear') {
				await this.client.redis.db.del(banLimitKey);
				return msg.reply('Ban limit has been cleared.');
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} ban limit: ${err.message}`);
		}
	}
}; 