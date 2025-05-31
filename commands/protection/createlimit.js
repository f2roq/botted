const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class CreateLimitCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'createlimit',
			group: 'protection',
			description: 'Set the auto protection limit for channel/role creation',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'type',
					type: 'string',
					oneOf: ['channel', 'role'],
					prompt: 'What type of limit do you want to set? (channel/role)'
				},
				{
					key: 'limit',
					type: 'integer',
					min: 1,
					max: 50,
					prompt: 'How many creations within 10 minutes should trigger protection? (1-50)'
				}
			]
		});
	}

	async run(msg, { type, limit }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}:limits`, type, limit.toString());
			return msg.reply(`The ${type} creation limit has been set to ${limit} per 10 minutes.`);
		} catch (err) {
			return msg.reply(`Failed to set creation limit: ${err.message}`);
		}
	}
}; 