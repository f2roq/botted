const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class WantiCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'wanti',
			group: 'protection',
			description: 'Allow or deny users to delete roles or channels',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['allow', 'deny'],
					prompt: 'Would you like to allow or deny users to delete roles or channels?'
				}
			]
		});
	}

	async run(msg, { action }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'wanti', action === 'allow' ? '1' : '0');
			return msg.reply(`Protection for role and channel deletion has been ${action === 'allow' ? 'disabled' : 'enabled'}.`);
		} catch (err) {
			return msg.reply(`Failed to update protection settings: ${err.message}`);
		}
	}
}; 