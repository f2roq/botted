const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class SpamCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'spam',
			group: 'protection',
			description: 'Set spam protection limits',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable spam protection?'
				},
				{
					key: 'messages',
					type: 'integer',
					min: 3,
					max: 15,
					prompt: 'How many messages in 5 seconds should trigger spam protection? (3-15)',
					default: 5
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['mute', 'kick', 'ban'],
					prompt: 'What action should be taken against spammers? (mute/kick/ban)',
					default: 'mute'
				}
			]
		});
	}

	async run(msg, { setting, messages, action }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'spam', setting === 'enable' ? '1' : '0');
			await this.client.redis.db.hset(`protection:${msg.guild.id}:spam`, 'limit', messages.toString());
			await this.client.redis.db.hset(`protection:${msg.guild.id}:spam`, 'action', action);
			
			if (setting === 'enable') {
				const actionText = action === 'mute' ? 'muted' : action === 'kick' ? 'kicked' : 'banned';
				return msg.reply(`Spam protection enabled. Users sending more than ${messages} messages in 5 seconds will be ${actionText}.`);
			} else {
				return msg.reply('Spam protection disabled.');
			}
		} catch (err) {
			return msg.reply(`Failed to update spam protection setting: ${err.message}`);
		}
	}
}; 