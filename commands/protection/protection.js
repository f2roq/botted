const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class ProtectionCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'protection',
			group: 'protection',
			description: 'View or set server protection settings',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['view', 'enable', 'disable'],
					prompt: 'Would you like to view, enable, or disable protection?',
					default: 'view'
				}
			]
		});
	}

	async run(msg, { setting }) {
		try {
			if (setting === 'view') {
				const settings = await this.client.redis.db.hgetall(`protection:${msg.guild.id}`);
				const limits = await this.client.redis.db.hgetall(`protection:${msg.guild.id}:limits`);
				
				const embed = new EmbedBuilder()
					.setTitle('Server Protection Settings')
					.setColor(0x00AE86)
					.setDescription('Current protection settings for this server')
					.addFields(
						{ name: 'Protection Status', value: settings.enabled === '1' ? 'Enabled' : 'Disabled', inline: true },
						{ name: 'Anti Role/Channel Delete', value: settings.wanti === '0' ? 'Enabled' : 'Disabled', inline: true },
						{ name: 'Anti Bot', value: settings.antibots === '1' ? 'Enabled' : 'Disabled', inline: true },
						{ name: 'Anti Spam', value: settings.spam === '1' ? 'Enabled' : 'Disabled', inline: true },
						{ name: 'Anti Join', value: settings.antijoin === '1' ? 'Enabled' : 'Disabled', inline: true },
						{ name: 'Channel Create Limit', value: limits.channel || 'Not Set', inline: true },
						{ name: 'Role Create Limit', value: limits.role || 'Not Set', inline: true }
					);
				
				return msg.reply({ embeds: [embed] });
			} else {
				await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'enabled', setting === 'enable' ? '1' : '0');
				return msg.reply(`Server protection has been ${setting === 'enable' ? 'enabled' : 'disabled'}.`);
			}
		} catch (err) {
			return msg.reply(`Failed to ${setting} protection: ${err.message}`);
		}
	}
}; 