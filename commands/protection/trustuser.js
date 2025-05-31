const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class TrustUserCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'trustuser',
			group: 'protection',
			description: 'Add or remove a user from the server\'s trust list with specific trust level',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['add', 'remove', 'update'],
					prompt: 'Would you like to add, remove, or update a user\'s trust level?'
				},
				{
					key: 'user',
					type: 'user',
					prompt: 'Which user would you like to modify?'
				},
				{
					key: 'level',
					type: 'integer',
					min: 1,
					max: 5,
					prompt: 'What trust level would you like to set? (1-5, where 5 is highest)',
					default: 1
				}
			]
		});
	}

	async run(msg, { action, user, level }) {
		try {
			const guildId = msg.guild.id;
			const trustKey = `protection:${guildId}:trusted`;
			const trustLevelKey = `protection:${guildId}:trustlevels`;

			if (action === 'add') {
				await this.client.redis.db.sadd(trustKey, user.id);
				await this.client.redis.db.hset(trustLevelKey, user.id, level.toString());
				
				return msg.reply(`${user.tag} has been added to the trust list with level ${level}.`);
			} else if (action === 'update') {
				const isTrusted = await this.client.redis.db.sismember(trustKey, user.id);
				
				if (!isTrusted) {
					return msg.reply(`${user.tag} is not in the trust list. Use the 'add' action first.`);
				}
				
				await this.client.redis.db.hset(trustLevelKey, user.id, level.toString());
				return msg.reply(`${user.tag}'s trust level has been updated to ${level}.`);
			} else {
				await this.client.redis.db.srem(trustKey, user.id);
				await this.client.redis.db.hdel(trustLevelKey, user.id);
				
				return msg.reply(`${user.tag} has been removed from the trust list.`);
			}
		} catch (err) {
			return msg.reply(`Failed to update trust list: ${err.message}`);
		}
	}
}; 