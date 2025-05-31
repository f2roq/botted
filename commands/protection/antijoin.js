const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class AntiJoinCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antijoin',
			group: 'protection',
			description: 'Set actions for new accounts joining the server',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable new account protection?'
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['ban', 'prison', 'kick'],
					prompt: 'What action should be taken for new accounts? (ban/prison/kick)',
					default: 'kick'
				},
				{
					key: 'days',
					type: 'integer',
					min: 1,
					max: 30,
					prompt: 'How many days should an account be old to bypass this filter? (1-30)',
					default: 7
				}
			]
		});
	}

	async run(msg, { setting, action, days }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'antijoin', setting === 'enable' ? '1' : '0');
			await this.client.redis.db.hset(`protection:${msg.guild.id}:antijoin`, 'action', action);
			await this.client.redis.db.hset(`protection:${msg.guild.id}:antijoin`, 'days', days.toString());
			
			if (setting === 'enable') {
				return msg.reply(`Anti-join protection enabled. Accounts newer than ${days} days will be ${action === 'ban' ? 'banned' : action === 'prison' ? 'quarantined' : 'kicked'} when joining.`);
			} else {
				return msg.reply('Anti-join protection disabled. All accounts can now join freely.');
			}
		} catch (err) {
			return msg.reply(`Failed to update anti-join setting: ${err.message}`);
		}
	}
}; 