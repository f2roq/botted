const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class ModuleExemptCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'moduleexempt',
			aliases: ['exempt'],
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
					default: 'list'
				},
				{
					key: 'user',
					type: 'user',
					prompt: 'Which user would you like to exempt?',
					default: ''
				},
				{
					key: 'module',
					type: 'string',
					prompt: 'Which module should this user be exempt from? (Use "all" for all modules)',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, user, module }) {
		try {
			const guildId = msg.guild.id;
			const exemptKey = `protection:${guildId}:moduleexempt`;
			
			// All available modules
			const modulesList = [
				'all', 'antijoin', 'antibots', 'antidelete', 'antiperms', 'antiedit', 
				'antilinks', 'antiword', 'antiemoji', 'antiinvite', 'smartban', 
				'antiraid', 'decay', 'verifybot', 'safemode', 'autocleanup', 
				'watchdog', 'rolefreeze', 'bblack', 'threatscore', 'spam'
			];
			
			if (action === 'list') {
				// Get all user exemptions
				const allExemptions = await this.client.redis.db.hgetall(exemptKey) || {};
				const userExemptions = {};
				
				// Process the data into a more usable format
				for (const [key, value] of Object.entries(allExemptions)) {
					const [userId, mod] = key.split(':');
					if (!userExemptions[userId]) {
						userExemptions[userId] = [];
					}
					userExemptions[userId].push(mod);
				}
				
				// Check if there are any exemptions
				if (Object.keys(userExemptions).length === 0) {
					return msg.reply('No user exemptions are currently configured.');
				}
				
				// Create embed
				const embed = new EmbedBuilder()
					.setTitle('🔓 User Module Exemptions')
					.setColor(0x00AE86)
					.setDescription('Users that are exempt from specific protection modules');
				
				// Add each user and their exempted modules
				for (const [userId, mods] of Object.entries(userExemptions)) {
					try {
						const user = await this.client.users.fetch(userId);
						const isGlobalExempt = mods.includes('all');
						let moduleText;
						
						if (isGlobalExempt) {
							moduleText = '**All protection modules**';
						} else {
							moduleText = mods.map(m => `\`${m}\``).join(', ');
						}
						
						embed.addFields({
							name: `${user.tag} ${isGlobalExempt ? '(Global Exempt)' : ''}`,
							value: moduleText,
							inline: false
						});
					} catch (error) {
						// User doesn't exist anymore
						// We should clean up the database
						for (const mod of mods) {
							await this.client.redis.db.hdel(exemptKey, `${userId}:${mod}`);
						}
					}
				}
				
				return msg.reply({ embeds: [embed] });
			}
			
			else if (action === 'add') {
				// Check if required arguments are provided
				if (!user) {
					return msg.reply('Please specify a user to exempt.');
				}
				
				if (!module) {
					return msg.reply('Please specify a module to exempt the user from.');
				}
				
				// Check if the module is valid
				if (!modulesList.includes(module)) {
					return msg.reply(`Invalid module. Available modules: ${modulesList.join(', ')}`);
				}
				
				if (module === 'all') {
					// Clear any existing module-specific exemptions for this user
					for (const mod of modulesList) {
						if (mod !== 'all') {
							await this.client.redis.db.hdel(exemptKey, `${user.id}:${mod}`);
						}
					}
					// Set global exemption
					await this.client.redis.db.hset(exemptKey, `${user.id}:all`, '1');
					return msg.reply(`${user.tag} will now be exempt from **all** protection modules.`);
				} else {
					// Check if the user already has global exemption
					const hasGlobalExempt = await this.client.redis.db.hexists(exemptKey, `${user.id}:all`);
					if (hasGlobalExempt) {
						return msg.reply(`${user.tag} already has a global exemption for all modules. Remove the global exemption first if you want to set module-specific exemptions.`);
					}
					
					// Add module-specific exemption
					await this.client.redis.db.hset(exemptKey, `${user.id}:${module}`, '1');
					return msg.reply(`${user.tag} will now be exempt from the ${module} module.`);
				}
			}
			
			else if (action === 'remove') {
				// Check if required arguments are provided
				if (!user) {
					return msg.reply('Please specify a user to remove exemption from.');
				}
				
				if (!module) {
					return msg.reply('Please specify a module to remove exemption for, or use "all" to remove all exemptions.');
				}
				
				if (module === 'all') {
					// Remove all exemptions for this user
					for (const mod of modulesList) {
						await this.client.redis.db.hdel(exemptKey, `${user.id}:${mod}`);
					}
					return msg.reply(`All module exemptions have been removed from ${user.tag}.`);
				} else {
					// Check if the module is valid
					if (!modulesList.includes(module)) {
						return msg.reply(`Invalid module. Available modules: ${modulesList.join(', ')}`);
					}
					
					// Remove specific module exemption
					const wasRemoved = await this.client.redis.db.hdel(exemptKey, `${user.id}:${module}`);
					
					if (wasRemoved === 0) {
						return msg.reply(`${user.tag} was not exempt from the ${module} module.`);
					}
					
					return msg.reply(`${user.tag} will no longer be exempt from the ${module} module.`);
				}
			}
			
			else if (action === 'clear') {
				// Confirm clear
				await msg.reply('⚠️ Are you sure you want to clear all user exemptions? This will remove all module exemptions for all users. Reply with "yes" to confirm.');
				
				// Wait for confirmation
				const filter = m => m.author.id === msg.author.id && m.content.toLowerCase() === 'yes';
				const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 15000 });
				
				if (collected.size === 0) {
					return msg.reply('Operation cancelled.');
				}
				
				// Clear all exemptions
				await this.client.redis.db.del(exemptKey);
				
				return msg.reply('All user module exemptions have been cleared.');
			}
			
		} catch (err) {
			return msg.reply(`Failed to ${action} module exemption: ${err.message}`);
		}
	}
}; 