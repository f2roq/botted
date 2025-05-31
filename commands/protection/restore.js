const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class RestoreCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'restore',
			group: 'protection',
			description: 'Restore deleted roles from backup',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'type',
					type: 'string',
					oneOf: ['roles', 'channels'],
					prompt: 'What do you want to restore? (roles/channels)'
				}
			]
		});
	}

	async run(msg, { type }) {
		try {
			// Check if there's a backup
			const backup = await this.client.redis.db.get(`protection:${msg.guild.id}:backup:${type}`);
			
			if (!backup) {
				return msg.reply(`No ${type} backup found for this server.`);
			}
			
			let restoredCount = 0;
			const backupData = JSON.parse(backup);
			
			await msg.reply(`Starting restoration of ${backupData.length} ${type}. This may take some time...`);
			
			if (type === 'roles') {
				for (const role of backupData) {
					try {
						await msg.guild.roles.create({
							name: role.name,
							color: role.color,
							hoist: role.hoist,
							position: role.position,
							permissions: BigInt(role.permissions),
							mentionable: role.mentionable
						});
						restoredCount++;
					} catch (err) {
						this.client.logger.error(`Failed to restore role ${role.name}: ${err}`);
					}
				}
			} else if (type === 'channels') {
				for (const channel of backupData) {
					try {
						await msg.guild.channels.create({
							name: channel.name,
							type: channel.type,
							topic: channel.topic,
							nsfw: channel.nsfw,
							parent: channel.parentId
						});
						restoredCount++;
					} catch (err) {
						this.client.logger.error(`Failed to restore channel ${channel.name}: ${err}`);
					}
				}
			}
			
			return msg.reply(`Successfully restored ${restoredCount} of ${backupData.length} ${type}.`);
		} catch (err) {
			return msg.reply(`Failed to restore ${type}: ${err.message}`);
		}
	}
}; 