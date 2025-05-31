const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class AntiPermsCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antiperms',
			group: 'protection',
			description: 'Protect against unauthorized role permission changes',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable protection against permission changes?'
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['revert', 'revert+log', 'revert+kick', 'revert+ban'],
					prompt: 'What action should be taken when unauthorized permission changes occur?',
					default: 'revert+log'
				}
			]
		});
	}

	async run(msg, { setting, action }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'antiperms', setting === 'enable' ? '1' : '0');
			await this.client.redis.db.hset(`protection:${msg.guild.id}:antiperms`, 'action', action);
			
			// If enabling, create a snapshot of current permissions
			if (setting === 'enable') {
				const permissions = {};
				
				msg.guild.roles.cache.forEach(role => {
					permissions[role.id] = role.permissions.toString();
				});
				
				await this.client.redis.db.set(`protection:${msg.guild.id}:permissions`, JSON.stringify(permissions));
				
				const actionText = action === 'revert' 
					? 'reverted' 
					: action === 'revert+log' 
						? 'reverted and logged' 
						: action === 'revert+kick' 
							? 'reverted and the user kicked' 
							: 'reverted and the user banned';
				
				return msg.reply(`Permission protection enabled. Unauthorized changes will be ${actionText}. A snapshot of current permissions has been saved.`);
			} else {
				return msg.reply('Permission protection disabled. Permission changes will not be monitored.');
			}
		} catch (err) {
			return msg.reply(`Failed to update permission protection: ${err.message}`);
		}
	}
}; 