const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class BBlackCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'bblack',
			group: 'protection',
			description: 'Block specific users from joining the server',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['add', 'remove', 'list'],
					prompt: 'What would you like to do? (add/remove/list)'
				},
				{
					key: 'user',
					type: 'user',
					prompt: 'Which user would you like to add/remove from the blacklist?',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, user }) {
		try {
			const key = `protection:${msg.guild.id}:blacklist`;
			
			if (action === 'add') {
				if (!user) return msg.reply('Please provide a user to add to the blacklist.');
				await this.client.redis.db.sadd(key, user.id);
				return msg.reply(`Added ${user.tag} (${user.id}) to the server blacklist. They will not be able to join the server.`);
			} else if (action === 'remove') {
				if (!user) return msg.reply('Please provide a user to remove from the blacklist.');
				await this.client.redis.db.srem(key, user.id);
				return msg.reply(`Removed ${user.tag} (${user.id}) from the server blacklist.`);
			} else if (action === 'list') {
				const blacklist = await this.client.redis.db.smembers(key);
				
				if (!blacklist.length) {
					return msg.reply('No users are currently blacklisted from this server.');
				}
				
				// Try to get tag information for each ID
				const userDetails = [];
				for (const id of blacklist) {
					try {
						const fetchedUser = await this.client.users.fetch(id);
						userDetails.push(`${fetchedUser.tag} (${id})`);
					} catch {
						userDetails.push(`Unknown User (${id})`);
					}
				}
				
				return msg.reply(`**Server Blacklist:**\n${userDetails.join('\n')}`);
			}
		} catch (err) {
			return msg.reply(`Failed to update server blacklist: ${err.message}`);
		}
	}
}; 