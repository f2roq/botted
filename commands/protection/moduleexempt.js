const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class ModuleExemptCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'moduleexempt',
			aliases: ['exempt', 'module-exempt'],
			group: 'protection',
			description: 'Configure exemptions for specific users from protection modules',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['add', 'remove', 'list', 'clear'],
					prompt: 'What would you like to do? (add/remove/list/clear)',
					default: 'list',
					examples: ['add', 'remove', 'list', 'clear']
				},
				{
					key: 'user',
					type: 'user',
					prompt: 'Which user would you like to exempt from protection modules?',
					default: '',
					examples: ['@username', 'username#1234', '123456789012345678']
				},
				{
					key: 'module',
					type: 'string',
					prompt: 'Which protection module should this user be exempt from? (Use "all" for all modules)',
					default: '',
					examples: ['antiword', 'antilinks', 'all']
				}
			]
		});
	}

	usage(argString) {
		return argString || `\`${this.client.commandPrefix}${this.name} [add|remove|list|clear] [user] [module]\``;
	}

	example(msg) {
		return [
			`${this.client.commandPrefix}${this.name} list`,
			`${this.client.commandPrefix}${this.name} add @username antiword`,
			`${this.client.commandPrefix}${this.name} add @username all`,
			`${this.client.commandPrefix}${this.name} remove @username antiword`
		].join('\n');
	}

	async run(msg, { action, user, module }) {
		try {
			const guildId = msg.guild.id;
			const exemptKey = `protection:${guildId}:exempt`;
			const modulesList = [
				'antijoin', 'antibots', 'antidelete', 'antiperms', 'antiedit', 
				'antilinks', 'antiword', 'antiemoji', 'antiinvite', 'smartban', 
				'antiraid', 'verifybot', 'safemode', 'autocleanup', 'watchdog', 
				'all'
			];
			
			if (action === 'list') {
				// Get all exemptions
				const exemptions = await this.client.redis.db.hgetall(exemptKey) || {};
				
				const embed = new EmbedBuilder()
					.setTitle('🛡️ Module Exemptions')
					.setColor(0x00AE86)
					.setDescription('Users who are exempt from specific protection modules');
				
				if (Object.keys(exemptions).length === 0) {
					embed.addFields({ 
						name: 'No Exemptions', 
						value: 'There are no users exempt from protection modules', 
						inline: false 
					});
				} else {
					// Group by user ID
					const userExemptions = {};
					
					for (const key in exemptions) {
						const [userId, moduleName] = key.split(':');
						
						if (!userExemptions[userId]) {
							userExemptions[userId] = [];
						}
						
						userExemptions[userId].push(moduleName);
					}
					
					// Add each user to the embed
					for (const userId in userExemptions) {
						try {
							const user = await this.client.users.fetch(userId);
							embed.addFields({ 
								name: `${user.tag} (${userId})`, 
								value: userExemptions[userId].join(', '), 
								inline: false 
							});
						} catch (error) {
							// User not found, use ID only
							embed.addFields({ 
								name: `Unknown User (${userId})`, 
								value: userExemptions[userId].join(', '), 
								inline: false 
							});
						}
					}
				}
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'add') {
				if (!user) {
					return msg.reply('Please specify a user to exempt.');
				}
				
				if (!module) {
					return msg.reply(`Please specify a module. Available modules: ${modulesList.join(', ')}`);
				}
				
				if (!modulesList.includes(module)) {
					return msg.reply(`Invalid module. Available modules: ${modulesList.join(', ')}`);
				}
				
				if (module === 'all') {
					// Add exemptions for all modules
					for (const mod of modulesList) {
						if (mod === 'all') continue; // Skip the 'all' meta-module
						await this.client.redis.db.hset(exemptKey, `${user.id}:${mod}`, '1');
					}
					
					return msg.reply(`${user.tag} is now exempt from all protection modules.`);
				} else {
					// Add exemption for specific module
					await this.client.redis.db.hset(exemptKey, `${user.id}:${module}`, '1');
					return msg.reply(`${user.tag} is now exempt from the ${module} protection module.`);
				}
			}
			
			else if (action === 'remove') {
				if (!user) {
					return msg.reply('Please specify a user to remove exemption from.');
				}
				
				if (!module) {
					return msg.reply(`Please specify a module. Available modules: ${modulesList.join(', ')}`);
				}
				
				if (module === 'all') {
					// Remove all exemptions for this user
					for (const mod of modulesList) {
						if (mod === 'all') continue; // Skip the 'all' meta-module
						await this.client.redis.db.hdel(exemptKey, `${user.id}:${mod}`);
					}
					
					return msg.reply(`All protection exemptions have been removed for ${user.tag}.`);
				} else {
					// Remove specific exemption
					await this.client.redis.db.hdel(exemptKey, `${user.id}:${module}`);
					return msg.reply(`${user.tag} is no longer exempt from the ${module} protection module.`);
				}
			}
			
			else if (action === 'clear') {
				// Confirm clear
				await msg.reply('⚠️ Are you sure you want to clear all module exemptions? Reply with "yes" to confirm.');
				
				// Wait for confirmation
				const filter = m => m.author.id === msg.author.id && m.content.toLowerCase() === 'yes';
				const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 15000 });
				
				if (collected.size === 0) {
					return msg.reply('Operation cancelled.');
				}
				
				// Clear all exemptions
				await this.client.redis.db.del(exemptKey);
				
				return msg.reply('All module exemptions have been cleared.');
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} module exemption: ${err.message}`);
		}
	}
}; 