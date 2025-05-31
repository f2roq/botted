const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class ECollectionCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'ecollection',
			group: 'protection',
			description: 'Edit collection protection settings for various events',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'type',
					type: 'string',
					oneOf: ['view', 'message', 'ban', 'kick', 'channel', 'role'],
					prompt: 'What type of collection protection would you like to edit? (view/message/ban/kick/channel/role)'
				},
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable'],
					prompt: 'Would you like to enable or disable this protection?',
					default: ''
				},
				{
					key: 'limit',
					type: 'integer',
					min: 3,
					max: 30,
					prompt: 'How many actions within 10 seconds should trigger protection?',
					default: 0
				}
			]
		});
	}

	async run(msg, { type, setting, limit }) {
		try {
			if (type === 'view') {
				const collections = await this.client.redis.db.hgetall(`protection:${msg.guild.id}:ecollection`);
				
				const embed = new EmbedBuilder()
					.setTitle('Collection Protection Settings')
					.setColor(0x00AE86)
					.setDescription('Current collection protection settings for this server')
					.addFields(
						{ name: 'Message Delete Protection', value: collections.message === '1' ? `Enabled (Limit: ${collections.message_limit || 'Default'})` : 'Disabled', inline: true },
						{ name: 'Ban Protection', value: collections.ban === '1' ? `Enabled (Limit: ${collections.ban_limit || 'Default'})` : 'Disabled', inline: true },
						{ name: 'Kick Protection', value: collections.kick === '1' ? `Enabled (Limit: ${collections.kick_limit || 'Default'})` : 'Disabled', inline: true },
						{ name: 'Channel Protection', value: collections.channel === '1' ? `Enabled (Limit: ${collections.channel_limit || 'Default'})` : 'Disabled', inline: true },
						{ name: 'Role Protection', value: collections.role === '1' ? `Enabled (Limit: ${collections.role_limit || 'Default'})` : 'Disabled', inline: true }
					);
				
				return msg.reply({ embeds: [embed] });
			}
			
			if (!setting) {
				return msg.reply('Please specify whether to enable or disable this protection.');
			}
			
			await this.client.redis.db.hset(`protection:${msg.guild.id}:ecollection`, type, setting === 'enable' ? '1' : '0');
			
			if (limit > 0) {
				await this.client.redis.db.hset(`protection:${msg.guild.id}:ecollection`, `${type}_limit`, limit.toString());
			}
			
			const actionNames = {
				message: 'message deletions',
				ban: 'server bans',
				kick: 'server kicks',
				channel: 'channel operations',
				role: 'role operations'
			};
			
			if (setting === 'enable') {
				const limitText = limit > 0 ? `with a threshold of ${limit} actions within 10 seconds` : 'with default threshold';
				return msg.reply(`Collection protection for ${actionNames[type]} has been enabled ${limitText}.`);
			} else {
				return msg.reply(`Collection protection for ${actionNames[type]} has been disabled.`);
			}
		} catch (err) {
			return msg.reply(`Failed to update collection settings: ${err.message}`);
		}
	}
}; 