const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class AntiLinksCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antilinks',
			group: 'protection',
			description: 'Enable or disable link filtering in chat',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable link filtering?'
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['delete', 'warn', 'mute'],
					prompt: 'What action should be taken when a link is posted? (delete/warn/mute)',
					default: 'delete'
				},
				{
					key: 'whitelist',
					type: 'string',
					prompt: 'Would you like to whitelist certain domains? (comma-separated, e.g. discord.com,youtube.com)',
					default: 'discord.com,youtube.com'
				}
			]
		});
	}

	async run(msg, { setting, action, whitelist }) {
		try {
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'antilinks', setting === 'enable' ? '1' : '0');
			await this.client.redis.db.hset(`protection:${msg.guild.id}:antilinks`, 'action', action);
			
			// Process and save whitelist
			const domains = whitelist.split(',').map(domain => domain.trim().toLowerCase());
			await this.client.redis.db.del(`protection:${msg.guild.id}:antilinks:whitelist`);
			
			if (domains.length && domains[0] !== '') {
				await this.client.redis.db.sadd(`protection:${msg.guild.id}:antilinks:whitelist`, ...domains);
			}
			
			if (setting === 'enable') {
				return msg.reply(`Link filtering enabled. Links will be ${action === 'delete' ? 'deleted' : action === 'warn' ? 'warned about' : 'result in a mute'}. ${domains.length && domains[0] !== '' ? `Whitelisted domains: ${domains.join(', ')}` : 'No domains are whitelisted.'}`);
			} else {
				return msg.reply('Link filtering disabled. Users can now post links freely.');
			}
		} catch (err) {
			return msg.reply(`Failed to update link filtering: ${err.message}`);
		}
	}
}; 