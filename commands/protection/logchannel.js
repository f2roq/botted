const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class LogChannelCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'logchannel',
			group: 'protection',
			description: 'Set the logging channel for protection events',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['set', 'clear', 'view'],
					prompt: 'What would you like to do? (set/clear/view)',
					default: 'view',
					examples: ['set', 'clear', 'view']
				},
				{
					key: 'channel',
					type: 'channel',
					prompt: 'Which channel should be used for protection logs?',
					default: '',
					examples: ['#security-logs', '#mod-log']
				}
			]
		});
	}

	usage(argString) {
		return argString || `\`${this.client.commandPrefix}${this.name} [set|clear|view] [channel]\``;
	}

	example(msg) {
		return [
			`${this.client.commandPrefix}${this.name} view`,
			`${this.client.commandPrefix}${this.name} set #security-logs`,
			`${this.client.commandPrefix}${this.name} clear`
		].join('\n');
	}

	async run(msg, { action, channel }) {
		try {
			const guildId = msg.guild.id;
			const logChannelKey = `protection:${guildId}:logchannel`;
			
			if (action === 'view') {
				const currentChannelId = await this.client.redis.db.get(logChannelKey);
				
				if (!currentChannelId) {
					return msg.reply('No log channel is currently set for protection events.');
				}
				
				try {
					const logChannel = await this.client.channels.fetch(currentChannelId);
					return msg.reply(`The current protection log channel is <#${logChannel.id}> (${logChannel.name}).`);
				} catch (error) {
					return msg.reply('The previously set log channel no longer exists or is inaccessible.');
				}
			} 
			else if (action === 'set') {
				if (!channel) {
					return msg.reply('You need to specify a channel when using the set action.');
				}
				
				// Check if the bot has access to the channel
				if (!channel.viewable || !channel.permissionsFor(msg.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
					return msg.reply(`I don't have permission to send messages in <#${channel.id}>. Please give me the required permissions first.`);
				}
				
				await this.client.redis.db.set(logChannelKey, channel.id);
				
				// Send a test message to the channel
				await channel.send({
					content: '🛡️ **Protection System Log Channel**',
					embeds: [{
						title: 'Log Channel Setup',
						description: 'This channel has been set as the protection system log channel.',
						color: 0x00AE86,
						fields: [
							{ name: 'Setup By', value: `${msg.author.tag} (${msg.author.id})`, inline: true },
							{ name: 'Date', value: new Date().toUTCString(), inline: true }
						],
						footer: { text: 'Protection logs will appear in this channel' }
					}]
				});
				
				return msg.reply(`Protection log channel has been set to <#${channel.id}>.`);
			}
			else if (action === 'clear') {
				await this.client.redis.db.del(logChannelKey);
				return msg.reply('Protection log channel has been cleared. Protection events will no longer be logged.');
			}
		} catch (err) {
			return msg.reply(`Failed to ${action} log channel: ${err.message}`);
		}
	}
}; 