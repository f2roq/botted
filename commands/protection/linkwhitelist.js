const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class LinkWhitelistCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'linkwhitelist',
			aliases: ['whitelist'],
			group: 'protection',
			description: 'Manage the whitelist of allowed domains for link filtering',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['add', 'remove', 'list', 'clear'],
					prompt: 'What would you like to do? (add/remove/list/clear)',
					default: 'list'
				},
				{
					key: 'domain',
					type: 'string',
					prompt: 'Which domain would you like to add or remove? (e.g., "youtube.com")',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, domain }) {
		try {
			const guildId = msg.guild.id;
			const whitelistKey = `protection:${guildId}:linkwhitelist`;
			
			if (action === 'list') {
				// Get current whitelist
				const whitelist = await this.client.redis.db.smembers(whitelistKey) || [];
				
				const embed = new EmbedBuilder()
					.setTitle('🔗 Link Whitelist')
					.setColor(0x00AE86)
					.setDescription('Domains that are allowed in the antilinks protection module');
				
				if (whitelist.length === 0) {
					embed.addFields({ 
						name: 'Status', 
						value: 'No domains are currently whitelisted', 
						inline: false 
					});
				} else {
					// Sort domains alphabetically
					whitelist.sort();
					
					// Split into chunks of 15 if needed
					if (whitelist.length > 15) {
						const chunks = this.chunkArray(whitelist, 15);
						
						for (let i = 0; i < chunks.length; i++) {
							embed.addFields({ 
								name: `Allowed Domains (${i + 1}/${chunks.length})`, 
								value: chunks[i].map(d => `\`${d}\``).join('\n'), 
								inline: true 
							});
						}
					} else {
						embed.addFields({ 
							name: 'Allowed Domains', 
							value: whitelist.map(d => `\`${d}\``).join('\n'), 
							inline: false 
						});
					}
				}
				
				// Add usage instructions
				embed.addFields({ 
					name: 'Usage', 
					value: [
						'`linkwhitelist add domain.com` - Add a domain to the whitelist',
						'`linkwhitelist remove domain.com` - Remove a domain from the whitelist',
						'`linkwhitelist clear` - Clear the entire whitelist'
					].join('\n'), 
					inline: false 
				});
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'add') {
				if (!domain) {
					return msg.reply('Please specify a domain to add to the whitelist.');
				}
				
				// Normalize domain (remove http://, https://, www. and anything after /)
				const normalizedDomain = this.normalizeDomain(domain);
				
				// Add to whitelist
				await this.client.redis.db.sadd(whitelistKey, normalizedDomain);
				
				return msg.reply(`Domain \`${normalizedDomain}\` has been added to the link whitelist.`);
			}
			
			else if (action === 'remove') {
				if (!domain) {
					return msg.reply('Please specify a domain to remove from the whitelist.');
				}
				
				// Normalize domain
				const normalizedDomain = this.normalizeDomain(domain);
				
				// Check if domain exists in whitelist
				const exists = await this.client.redis.db.sismember(whitelistKey, normalizedDomain);
				
				if (!exists) {
					return msg.reply(`Domain \`${normalizedDomain}\` is not in the whitelist.`);
				}
				
				// Remove from whitelist
				await this.client.redis.db.srem(whitelistKey, normalizedDomain);
				
				return msg.reply(`Domain \`${normalizedDomain}\` has been removed from the link whitelist.`);
			}
			
			else if (action === 'clear') {
				// Confirm clear
				await msg.reply('⚠️ Are you sure you want to clear the entire link whitelist? This will cause all links to be blocked by the antilinks module if enabled. Reply with "yes" to confirm.');
				
				// Wait for confirmation
				const filter = m => m.author.id === msg.author.id && m.content.toLowerCase() === 'yes';
				const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 15000 });
				
				if (collected.size === 0) {
					return msg.reply('Operation cancelled.');
				}
				
				// Clear whitelist
				await this.client.redis.db.del(whitelistKey);
				
				return msg.reply('Link whitelist has been cleared. All links will now be blocked if the antilinks module is enabled.');
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} link whitelist: ${err.message}`);
		}
	}
	
	// Helper methods
	normalizeDomain(domain) {
		// Remove protocol
		let normalized = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
		
		// Remove anything after the domain (path, query string, etc.)
		normalized = normalized.split('/')[0];
		
		return normalized.toLowerCase();
	}
	
	chunkArray(array, chunkSize) {
		const chunks = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize));
		}
		return chunks;
	}
}; 