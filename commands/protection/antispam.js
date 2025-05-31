const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class AntiSpamCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antispam',
			aliases: ['spam'],
			group: 'protection',
			description: 'Configure spam protection settings',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['enable', 'disable', 'set', 'view'],
					prompt: 'What would you like to do? (enable/disable/set/view)',
					default: 'view'
				},
				{
					key: 'setting',
					type: 'string',
					oneOf: ['messages', 'interval', 'action', 'cooldown'],
					prompt: 'Which setting would you like to configure? (messages/interval/action/cooldown)',
					default: ''
				},
				{
					key: 'value',
					type: 'string',
					prompt: 'What value would you like to set?',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, setting, value }) {
		try {
			const guildId = msg.guild.id;
			const spamKey = `protection:${guildId}:spam`;
			
			if (action === 'view') {
				// Get current spam settings
				const spamSettings = await this.client.redis.db.hgetall(spamKey) || {};
				const isEnabled = spamSettings.enabled === '1';
				
				const embed = new EmbedBuilder()
					.setTitle('🔄 Anti-Spam Settings')
					.setColor(isEnabled ? 0x00AE86 : 0xE74C3C)
					.setDescription(`Anti-spam protection is currently **${isEnabled ? 'ENABLED' : 'DISABLED'}**\n\nUse \`antispam enable/disable\` to toggle it.`);
				
				const messages = spamSettings.messages || '5';
				const interval = spamSettings.interval || '10';
				const spamAction = spamSettings.action || 'mute';
				const cooldown = spamSettings.cooldown || '30';
				
				embed.addFields(
					{ 
						name: '⚙️ Current Settings', 
						value: [
							`**Message Limit**: ${messages} messages`,
							`**Time Interval**: ${interval} seconds`,
							`**Action**: ${this.formatAction(spamAction)}`,
							`**Cooldown**: ${cooldown} seconds`
						].join('\n'),
						inline: false
					},
					{
						name: '📋 Configuration Commands',
						value: [
							'`antispam set messages <number>` - Set how many messages trigger spam detection',
							'`antispam set interval <seconds>` - Set the time window for counting messages',
							'`antispam set action <mute/kick/ban/delete>` - Set what happens when spam is detected',
							'`antispam set cooldown <seconds>` - Set how long users are muted for'
						].join('\n'),
						inline: false
					}
				);
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'enable') {
				// Enable spam protection
				await this.client.redis.db.hset(spamKey, 'enabled', '1');
				
				// Set default values if they don't exist
				const defaults = {
					messages: '5',
					interval: '10',
					action: 'mute',
					cooldown: '30'
				};
				
				for (const [key, value] of Object.entries(defaults)) {
					const exists = await this.client.redis.db.hexists(spamKey, key);
					if (!exists) {
						await this.client.redis.db.hset(spamKey, key, value);
					}
				}
				
				return msg.reply('Anti-spam protection has been enabled. Users sending too many messages too quickly will be actioned.');
			}
			
			else if (action === 'disable') {
				// Disable spam protection
				await this.client.redis.db.hset(spamKey, 'enabled', '0');
				return msg.reply('Anti-spam protection has been disabled.');
			}
			
			else if (action === 'set') {
				if (!setting) {
					return msg.reply('Please specify a setting to configure (messages/interval/action/cooldown).');
				}
				
				if (!value) {
					return msg.reply(`Please specify a value for the ${setting} setting.`);
				}
				
				// Validate and set the value
				if (setting === 'messages') {
					// Validate messages is a number
					const messagesValue = parseInt(value);
					if (isNaN(messagesValue) || messagesValue < 2 || messagesValue > 20) {
						return msg.reply('Message limit must be a number between 2 and 20.');
					}
					
					await this.client.redis.db.hset(spamKey, 'messages', messagesValue.toString());
					return msg.reply(`Spam detection will now trigger after ${messagesValue} messages within the time interval.`);
				}
				
				else if (setting === 'interval') {
					// Validate interval is a number
					const intervalValue = parseInt(value);
					if (isNaN(intervalValue) || intervalValue < 3 || intervalValue > 60) {
						return msg.reply('Time interval must be a number between 3 and 60 seconds.');
					}
					
					await this.client.redis.db.hset(spamKey, 'interval', intervalValue.toString());
					return msg.reply(`Spam detection will now check messages within a ${intervalValue} second window.`);
				}
				
				else if (setting === 'action') {
					// Validate action is valid
					const validActions = ['mute', 'kick', 'ban', 'delete'];
					if (!validActions.includes(value.toLowerCase())) {
						return msg.reply(`Invalid action. Please choose from: ${validActions.join(', ')}`);
					}
					
					await this.client.redis.db.hset(spamKey, 'action', value.toLowerCase());
					return msg.reply(`Spam detection will now ${this.formatAction(value.toLowerCase())} users who spam.`);
				}
				
				else if (setting === 'cooldown') {
					// Validate cooldown is a number
					const cooldownValue = parseInt(value);
					if (isNaN(cooldownValue) || cooldownValue < 5 || cooldownValue > 86400) {
						return msg.reply('Cooldown must be a number between 5 and 86400 seconds (1 day).');
					}
					
					await this.client.redis.db.hset(spamKey, 'cooldown', cooldownValue.toString());
					return msg.reply(`Users will now be muted for ${cooldownValue} seconds when spam is detected (if mute action is selected).`);
				}
			}
			
		} catch (err) {
			return msg.reply(`Failed to update anti-spam settings: ${err.message}`);
		}
	}
	
	formatAction(action) {
		switch (action.toLowerCase()) {
			case 'mute':
				return 'temporarily mute';
			case 'kick':
				return 'kick';
			case 'ban':
				return 'ban';
			case 'delete':
				return 'only delete messages from';
			default:
				return action;
		}
	}
}; 