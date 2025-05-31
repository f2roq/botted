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
					default: 'list',
					examples: ['add', 'remove', 'list', 'enable']
				},
				{
					key: 'word',
					type: 'string',
					prompt: 'Which word or phrase would you like to add or remove?',
					default: '',
					examples: ['badword', 'inappropriate phrase']
				}
			]
		});
	}

	usage(argString) {
		return argString || `\`${this.client.commandPrefix}${this.name} [add|remove|list|clear|enable|disable] [word]\``;
	}

	example(msg) {
		return [
			`${this.client.commandPrefix}${this.name} list`,
			`${this.client.commandPrefix}${this.name} add badword`,
			`${this.client.commandPrefix}${this.name} remove badword`,
			`${this.client.commandPrefix}${this.name} enable`
		].join('\n');
	}

	async run(msg, { action, word }) {
		try {
			const guildId = msg.guild.id;
			const protectionKey = `protection:${guildId}`;
			const wordListKey = `${protectionKey}:antiword`;
			
			if (action === 'list') {
				// Get current blocked words
				const blockedWords = await this.client.redis.db.smembers(wordListKey) || [];
				const isEnabled = await this.client.redis.db.hget(protectionKey, 'antiword') === '1';
				
				const embed = new EmbedBuilder()
					.setTitle('🚫 Banned Words List')
					.setColor(isEnabled ? 0x00AE86 : 0xE74C3C)
					.setDescription(`Word filtering is currently **${isEnabled ? 'ENABLED' : 'DISABLED'}**`);
				
				if (blockedWords.length === 0) {
					embed.addFields({ 
						name: 'Status', 
						value: 'No words are currently banned', 
						inline: false 
					});
				} else {
					// Sort words alphabetically
					blockedWords.sort();
					
					// Censor words for the display
					const censoredWords = blockedWords.map(word => this.censorWord(word));
					
					// Split into chunks of 15 if needed
					if (censoredWords.length > 15) {
						const chunks = [];
						for (let i = 0; i < censoredWords.length; i += 15) {
							chunks.push(censoredWords.slice(i, i + 15));
						}
						
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
						'`antiword add <word>` - Add a word to the filter',
						'`antiword remove <word>` - Remove a word from the filter',
						'`antiword enable` - Enable the word filter',
						'`antiword disable` - Disable the word filter',
						'`antiword clear` - Clear all banned words'
					].join('\n'), 
					inline: false 
				});
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'add') {
				if (!word) {
					return msg.reply('Please specify a word or phrase to ban.');
				}
				
				// Add to banned words list
				await this.client.redis.db.sadd(wordListKey, word.toLowerCase());
				
				return msg.reply(`Word/phrase \`${this.censorWord(word)}\` has been added to the banned words list.`);
			}
			
			else if (action === 'remove') {
				if (!word) {
					return msg.reply('Please specify a word or phrase to unban.');
				}
				
				// Check if word exists in banned list
				const exists = await this.client.redis.db.sismember(wordListKey, word.toLowerCase());
				
				if (!exists) {
					return msg.reply(`Word/phrase \`${word}\` is not in the banned words list.`);
				}
				
				// Remove from banned words list
				await this.client.redis.db.srem(wordListKey, word.toLowerCase());
				
				return msg.reply(`Word/phrase \`${word}\` has been removed from the banned words list.`);
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
}; 