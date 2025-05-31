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
					key: 'action',
					type: 'string',
					oneOf: ['view', 'enable', 'disable', 'status'],
					prompt: 'What would you like to do? (view/enable/disable/status)',
					default: 'view',
					examples: ['view', 'enable', 'disable']
				},
				{
					key: 'module',
					type: 'string',
					prompt: 'Which protection module would you like to configure?',
					default: '',
					examples: ['antiword', 'antilinks', 'safemode']
				}
			]
		});
	}

	usage(argString) {
		return argString || `\`${this.client.commandPrefix}${this.name} [view|enable|disable|status] [module]\``;
	}

	example(msg) {
		return [
			`${this.client.commandPrefix}${this.name} view`,
			`${this.client.commandPrefix}${this.name} enable`,
			`${this.client.commandPrefix}${this.name} disable antiword`
		].join('\n');
	}

	async run(msg, { action, module }) {
		try {
			const protectionKey = `protection:${msg.guild.id}`;
			const modulesList = [
				'antijoin', 'antibots', 'antidelete', 'antiperms', 'antiedit', 
				'antilinks', 'antiword', 'antiemoji', 'antiinvite', 'smartban', 
				'antiraid', 'decay', 'verifybot', 'safemode', 'autocleanup', 
				'watchdog', 'rolefreeze', 'bblack', 'threatscore'
			];

			// If module is specified but not in the list, show error
			if (module && !modulesList.includes(module) && action !== 'view') {
				return msg.reply(`Invalid module. Available modules: ${modulesList.join(', ')}`);
			}

			if (action === 'view') {
				const settings = await this.client.redis.db.hgetall(protectionKey) || {};
				const moduleSettings = {};

				// Get settings for all modules
				for (const mod of modulesList) {
					moduleSettings[mod] = await this.client.redis.db.hgetall(`${protectionKey}:${mod}`) || {};
				}

				const embed = new EmbedBuilder()
					.setTitle('🛡️ Server Protection Settings')
					.setColor(0x00AE86)
					.setDescription('Current protection settings for this server')
					.addFields(
						{ name: '🔒 Protection Status', value: settings.enabled === '1' ? 'Enabled' : 'Disabled', inline: true },
						{ name: '👥 Trusted Users', value: await this.getTrustedUsersCount(msg.guild.id), inline: true },
						{ name: '⚙️ Active Modules', value: this.getActiveModulesCount(settings), inline: true }
					);

				// Add module status fields
				const coreModules = ['antijoin', 'antibots', 'antidelete', 'antiperms', 'antilinks', 'antiword', 'smartban'];
				const advancedModules = ['antiraid', 'verifybot', 'safemode', 'watchdog', 'rolefreeze', 'threatscore'];

				embed.addFields(
					{ 
						name: '🔧 Core Protection Modules', 
						value: this.formatModulesStatus(coreModules, settings), 
						inline: false 
					},
					{ 
						name: '🧠 Advanced Protection Modules', 
						value: this.formatModulesStatus(advancedModules, settings), 
						inline: false 
					}
				);

				return msg.reply({ embeds: [embed] });
			} 
			
			else if (action === 'status') {
				// Show detailed status of a specific module
				if (!module) {
					return msg.reply('Please specify a module to view status.');
				}
				
				const moduleSettings = await this.client.redis.db.hgetall(`${protectionKey}:${module}`) || {};
				const isEnabled = await this.client.redis.db.hget(protectionKey, module) === '1';
				
				const embed = new EmbedBuilder()
					.setTitle(`Module Status: ${module}`)
					.setColor(isEnabled ? 0x00AE86 : 0xE74C3C)
					.setDescription(`Current settings for the ${module} protection module`)
					.addFields({ name: 'Status', value: isEnabled ? 'Enabled' : 'Disabled', inline: false });
				
				// Add module-specific settings
				Object.keys(moduleSettings).forEach(key => {
					if (key !== 'enabled') {
						embed.addFields({ name: this.formatSettingName(key), value: moduleSettings[key], inline: true });
					}
				});
				
				// Add module description
				embed.addFields({ 
					name: 'Description', 
					value: this.getModuleDescription(module), 
					inline: false 
				});
				
				return msg.reply({ embeds: [embed] });
			}
			
			else {
				// Enable/disable specific module or all protection
				if (!module) {
					// Set global protection status
					await this.client.redis.db.hset(protectionKey, 'enabled', action === 'enable' ? '1' : '0');
					return msg.reply(`Server protection has been ${action === 'enable' ? 'enabled' : 'disabled'}.`);
				} else {
					// Set module-specific status
					await this.client.redis.db.hset(protectionKey, module, action === 'enable' ? '1' : '0');
					return msg.reply(`Protection module ${module} has been ${action === 'enable' ? 'enabled' : 'disabled'}.`);
				}
			}
		} catch (err) {
			return msg.reply(`Failed to manage protection settings: ${err.message}`);
		}
	}

	// Helper functions
	async getTrustedUsersCount(guildId) {
		const trustedUsers = await this.client.redis.db.smembers(`protection:${guildId}:trusted`);
		return trustedUsers.length.toString() || '0';
	}

	getActiveModulesCount(settings) {
		let count = 0;
		for (const key in settings) {
			if (key !== 'enabled' && settings[key] === '1') {
				count++;
			}
		}
		return count.toString();
	}

	formatModulesStatus(modules, settings) {
		return modules.map(mod => {
			const status = settings[mod] === '1';
			return `${status ? '✅' : '❌'} ${mod}`;
		}).join('\n') || 'No modules configured';
	}

	formatSettingName(key) {
		// Convert camelCase or snake_case to Title Case with spaces
		return key
			.replace(/([A-Z])/g, ' $1')
			.replace(/_/g, ' ')
			.replace(/^\w/, c => c.toUpperCase());
	}

	getModuleDescription(module) {
		const descriptions = {
			antijoin: 'Ban or jail new suspicious accounts based on account age and behavior',
			antibots: 'Automatically kick unverified bots when they join the server',
			antidelete: 'Prevent unauthorized deletion of channels or roles',
			antiperms: 'Protect against unauthorized role permission changes',
			antiedit: 'Prevent unauthorized renaming of roles or channels',
			antilinks: 'Block or filter potentially harmful links in messages',
			antiword: 'Auto-mute users who post banned words or phrases',
			antiemoji: 'Prevent unauthorized emoji creation or deletion',
			antiinvite: 'Block external Discord invite links in messages',
			smartban: 'Automatically ban users who trigger multiple protection systems',
			antiraid: 'Detect and respond to suspicious mass-join behavior',
			decay: 'Take action on inactive server members after a set period',
			verifybot: 'Suspend unverified bots for manual approval',
			safemode: 'Toggle full server lockdown during attacks',
			autocleanup: 'Automatically prune inactive members after a set period',
			watchdog: 'Monitor specific users for suspicious behavior',
			rolefreeze: 'Prevent changes to specific roles',
			bblack: 'Block specific users from joining the server',
			threatscore: 'AI-based scoring system for suspicious user behavior'
		};

		return descriptions[module] || 'No description available';
	}
}; 