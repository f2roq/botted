const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class AntiWordCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'antiword',
			group: 'protection',
			description: 'Manage blocked words and phrases for the server',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['add', 'remove', 'list', 'clear', 'enable', 'disable'],
					prompt: 'What would you like to do? (add/remove/list/clear/enable/disable)',
					default: 'list'
				},
				{
					key: 'word',
					type: 'string',
					prompt: 'Which word or phrase would you like to add or remove?',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, word }) {
		try {
			const guildId = msg.guild.id;
			const wordListKey = `protection:${guildId}:antiword`;
			const protectionKey = `protection:${guildId}`;
			
			if (action === 'list') {
				// Get current blocked words
				const wordList = await this.client.redis.db.smembers(wordListKey) || [];
				const isEnabled = await this.client.redis.db.hget(protectionKey, 'antiword') === '1';
				
				const embed = new EmbedBuilder()
					.setTitle('🚫 Banned Words')
					.setColor(isEnabled ? 0x00AE86 : 0xE74C3C)
					.setDescription(`Antiword protection is currently **${isEnabled ? 'ENABLED' : 'DISABLED'}**\n\nUse \`antiword enable/disable\` to toggle it.`);
				
				if (wordList.length === 0) {
					embed.addFields({ 
						name: 'Status', 
						value: 'No words are currently blocked', 
						inline: false 
					});
				} else {
					// Sort alphabetically
					wordList.sort();
					
					// To prevent Discord from complaining about sending offensive content,
					// censor the words by replacing middle characters with asterisks
					const censoredWords = wordList.map(word => this.censorWord(word));
					
					// Split into chunks of 15 if needed
					if (censoredWords.length > 15) {
						const chunks = this.chunkArray(censoredWords, 15);
						
						for (let i = 0; i < chunks.length; i++) {
							embed.addFields({ 
								name: `Banned Words (${i + 1}/${chunks.length})`, 
								value: chunks[i].map(w => `\`${w}\``).join('\n'), 
								inline: true 
							});
						}
					} else {
						embed.addFields({ 
							name: 'Banned Words', 
							value: censoredWords.map(w => `\`${w}\``).join('\n'), 
							inline: false 
						});
					}
				}
				
				// Add usage instructions
				embed.addFields({ 
					name: 'Usage', 
					value: [
						'`antiword add word` - Add a word to the ban list',
						'`antiword remove word` - Remove a word from the ban list',
						'`antiword clear` - Clear the entire word ban list',
						'`antiword enable` - Enable antiword filtering',
						'`antiword disable` - Disable antiword filtering'
					].join('\n'), 
					inline: false 
				});
				
				// Send as a direct message to avoid showing the list publicly
				try {
					await msg.author.send({ embeds: [embed] });
					return msg.reply('I\'ve sent you a DM with the banned word list.');
				} catch (error) {
					// If DM fails, send in channel but warn that it contains sensitive content
					return msg.reply({ 
						content: 'I couldn\'t send you a DM. Here\'s the banned word list:', 
						embeds: [embed] 
					});
				}
			}
			
			else if (action === 'add') {
				if (!word) {
					return msg.reply('Please specify a word or phrase to add to the ban list.');
				}
				
				// Add to word list
				await this.client.redis.db.sadd(wordListKey, word.toLowerCase());
				
				// Delete the command message to avoid keeping the word in chat
				try {
					await msg.delete();
				} catch (error) {
					// Ignore if we can't delete
				}
				
				return msg.reply(`A new word has been added to the banned words list.`);
			}
			
			else if (action === 'remove') {
				if (!word) {
					return msg.reply('Please specify a word or phrase to remove from the ban list.');
				}
				
				// Check if word exists in list
				const exists = await this.client.redis.db.sismember(wordListKey, word.toLowerCase());
				
				if (!exists) {
					return msg.reply(`That word is not in the banned words list.`);
				}
				
				// Remove from word list
				await this.client.redis.db.srem(wordListKey, word.toLowerCase());
				
				// Delete the command message to avoid keeping the word in chat
				try {
					await msg.delete();
				} catch (error) {
					// Ignore if we can't delete
				}
				
				return msg.reply(`A word has been removed from the banned words list.`);
			}
			
			else if (action === 'clear') {
				// Confirm clear
				await msg.reply('⚠️ Are you sure you want to clear the entire banned words list? Reply with "yes" to confirm.');
				
				// Wait for confirmation
				const filter = m => m.author.id === msg.author.id && m.content.toLowerCase() === 'yes';
				const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 15000 });
				
				if (collected.size === 0) {
					return msg.reply('Operation cancelled.');
				}
				
				// Clear word list
				await this.client.redis.db.del(wordListKey);
				
				return msg.reply('Banned words list has been cleared.');
			}
			
			else if (action === 'enable') {
				await this.client.redis.db.hset(protectionKey, 'antiword', '1');
				return msg.reply('Antiword protection has been enabled. Banned words will now be automatically filtered.');
			}
			
			else if (action === 'disable') {
				await this.client.redis.db.hset(protectionKey, 'antiword', '0');
				return msg.reply('Antiword protection has been disabled. Banned words will no longer be filtered.');
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} banned word list: ${err.message}`);
		}
	}
	
	// Helper methods
	censorWord(word) {
		if (word.length <= 2) return word;
		
		// Replace middle characters with asterisks, keep first and last
		return word.charAt(0) + '*'.repeat(word.length - 2) + word.charAt(word.length - 1);
	}
	
	chunkArray(array, chunkSize) {
		const chunks = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize));
		}
		return chunks;
	}
}; 