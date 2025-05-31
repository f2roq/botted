const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class TrustUserCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'trustuser',
			group: 'protection',
			description: 'Add or remove a user from the server\'s trust list',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['add', 'remove'],
					prompt: 'Would you like to add or remove a user from the trust list?'
				},
				{
					key: 'user',
					type: 'user',
					prompt: 'Which user would you like to add/remove?'
				}
			]
		});
	}

	async run(msg, { action, user }) {
		try {
			if (action === 'add') {
				await this.client.redis.db.sadd(`protection:${msg.guild.id}:trusted`, user.id);
				return msg.reply(`${user.tag} has been added to the trust list.`);
			} else {
				await this.client.redis.db.srem(`protection:${msg.guild.id}:trusted`, user.id);
				return msg.reply(`${user.tag} has been removed from the trust list.`);
			}
		} catch (err) {
			return msg.reply(`Failed to update trust list: ${err.message}`);
		}
	}
}; 