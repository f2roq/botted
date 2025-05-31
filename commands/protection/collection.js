const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class CollectionCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'collection',
			group: 'protection',
			description: 'Edit anti-role settings to prevent mass role changes',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable protection against mass role changes?'
				},
				{
					key: 'limit',
					type: 'integer',
					min: 3,
					max: 20,
					prompt: 'How many role changes in 10 seconds should trigger protection? (3-20)',
					default: 5
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['revert', 'revert+kick', 'revert+ban'],
					prompt: 'What action should be taken when mass role changes are detected?',
					default: 'revert'
				}
			]
		});
	}

	async run(msg, { setting, limit, action }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'collection', setting === 'enable' ? '1' : '0');
			await this.client.redis.db.hset(`protection:${msg.guild.id}:collection`, 'limit', limit.toString());
			await this.client.redis.db.hset(`protection:${msg.guild.id}:collection`, 'action', action);
			
			if (setting === 'enable') {
				const actionText = action === 'revert' 
					? 'reverted' 
					: action === 'revert+kick' 
						? 'reverted and the user kicked' 
						: 'reverted and the user banned';
				
				return msg.reply(`Anti-role-collection protection enabled. More than ${limit} role changes in 10 seconds will be ${actionText}.`);
			} else {
				return msg.reply('Anti-role-collection protection disabled.');
			}
		} catch (err) {
			return msg.reply(`Failed to update anti-role-collection setting: ${err.message}`);
		}
	}
}; 