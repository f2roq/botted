const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class AntiDeleteCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antidelete',
			group: 'protection',
			description: 'Enable or disable protection against channel/role deletion',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable anti-deletion protection?'
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['ban', 'kick', 'none'],
					prompt: 'What action should be taken against users who delete channels/roles? (ban/kick/none)',
					default: 'none'
				}
			]
		});
	}

	async run(msg, { setting, action }) {
		try {
			// This is essentially an alias for wanti with some extra actions
			await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'wanti', setting === 'enable' ? '0' : '1');
			await this.client.redis.db.hset(`protection:${msg.guild.id}:antidelete`, 'action', action);
			
			// Create a backup of current roles and channels
			if (setting === 'enable') {
				// Backup roles
				const roles = msg.guild.roles.cache
					.filter(role => !role.managed && role.id !== msg.guild.id) // Filter out managed roles and @everyone
					.map(role => ({
						name: role.name,
						color: role.hexColor,
						hoist: role.hoist,
						position: role.position,
						permissions: role.permissions.toString(),
						mentionable: role.mentionable
					}));
				
				// Backup channels
				const channels = msg.guild.channels.cache.map(channel => ({
					name: channel.name,
					type: channel.type,
					topic: channel.topic,
					nsfw: channel.nsfw,
					parentId: channel.parentId
				}));
				
				// Save backups
				await this.client.redis.db.set(`protection:${msg.guild.id}:backup:roles`, JSON.stringify(roles));
				await this.client.redis.db.set(`protection:${msg.guild.id}:backup:channels`, JSON.stringify(channels));
				
				return msg.reply(`Anti-deletion protection enabled with ${action === 'none' ? 'no punitive action' : `${action} action`} against violators. A backup of current roles and channels has been created.`);
			} else {
				return msg.reply('Anti-deletion protection disabled. Users with proper permissions can now delete channels and roles.');
			}
		} catch (err) {
			return msg.reply(`Failed to update anti-deletion setting: ${err.message}`);
		}
	}
}; 