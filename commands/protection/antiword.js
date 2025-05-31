const Command = require('../../framework/Command');
const { PermissionFlagsBits } = require('discord.js');

module.exports = class AntiWordCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antiword',
			group: 'protection',
			description: 'Set up protection against inappropriate words',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'setting',
					type: 'string',
					oneOf: ['enable', 'disable', 'add', 'remove', 'list'],
					prompt: 'What would you like to do with the word filter? (enable/disable/add/remove/list)'
				},
				{
					key: 'word',
					type: 'string',
					prompt: 'What word would you like to add/remove?',
					default: ''
				}
			]
		});
	}

	async run(msg, { setting, word }) {
		try {
			const key = `protection:${msg.guild.id}:antiword`;
			
			if (setting === 'enable' || setting === 'disable') {
				await this.client.redis.db.hset(`protection:${msg.guild.id}`, 'antiword', setting === 'enable' ? '1' : '0');
				return msg.reply(`Word filter has been ${setting}d.`);
			} else if (setting === 'add') {
				if (!word) return msg.reply('Please provide a word to add to the filter.');
				await this.client.redis.db.sadd(key, word.toLowerCase());
				
				// Delete message containing the word to avoid having it in chat
				await msg.delete().catch(() => null);
				
				return msg.author.send(`Added "${word}" to the word filter.`);
			} else if (setting === 'remove') {
				if (!word) return msg.reply('Please provide a word to remove from the filter.');
				await this.client.redis.db.srem(key, word.toLowerCase());
				return msg.reply(`Removed "${word}" from the word filter.`);
			} else if (setting === 'list') {
				const words = await this.client.redis.db.smembers(key);
				
				if (!words.length) {
					return msg.reply('No words are currently in the filter.');
				}
				
				// Send the word list to DMs to avoid displaying them in public
				try {
					await msg.author.send(`**Filtered Words:**\n${words.join(', ')}`);
					return msg.reply('I\'ve sent you a DM with the list of filtered words.');
				} catch (err) {
					return msg.reply('I couldn\'t send you a DM. Please enable DMs from server members.');
				}
			}
		} catch (err) {
			return msg.reply(`Failed to update word filter: ${err.message}`);
		}
	}
}; 