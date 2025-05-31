const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class SetRJoinCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'setrjoin',
			group: 'protection',
			description: 'Set the action to take for new accounts joining the server',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['normal', 'verification', 'quarantine'],
					prompt: 'What action should be taken for new accounts? (normal/verification/quarantine)'
				},
				{
					key: 'days',
					type: 'integer',
					min: 0,
					max: 30,
					prompt: 'How many days should an account be considered new? (0-30)',
					default: 7
				}
			]
		});
	}

	async run(msg, { action, days }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}:rjoin`, 'action', action);
			await this.client.redis.db.hset(`protection:${msg.guild.id}:rjoin`, 'days', days.toString());
			
			let responseText = '';
			
			if (action === 'normal') {
				responseText = 'New accounts will be treated normally when joining.';
			} else if (action === 'verification') {
				responseText = `New accounts (less than ${days} days old) will need to complete verification when joining.`;
			} else if (action === 'quarantine') {
				responseText = `New accounts (less than ${days} days old) will be placed in quarantine when joining.`;
			}
			
			return msg.reply(`New account join settings updated. ${responseText}`);
		} catch (err) {
			return msg.reply(`Failed to update new account settings: ${err.message}`);
		}
	}
}; 