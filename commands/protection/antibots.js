const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class AntiBotsCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antibots',
			group: 'protection',
			description: 'Enable or disable auto-kicking of bots when they join the server',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable anti-bot protection?'
				}
			]
		});
	}

	async run(msg, { setting }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'antibots', setting === 'enable' ? '1' : '0');
			return msg.reply(`Anti-bot protection has been ${setting}d. ${setting === 'enable' ? 'Bots that join will be automatically kicked.' : 'Bots can now join the server.'}`);
		} catch (err) {
			return msg.reply(`Failed to update anti-bot setting: ${err.message}`);
		}
	}
}; 