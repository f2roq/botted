const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class ModuleCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'module',
			group: 'protection',
			description: 'Enable or disable specific protection modules',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['enable', 'disable', 'list'],
					prompt: 'What would you like to do? (enable/disable/list)',
					default: 'list'
				},
				{
					key: 'moduleName',
					type: 'string',
					prompt: 'Which module would you like to configure?',
					default: ''
				}
			]
		});
	}

	async run(msg, { action, moduleName }) {
		try {
			const guildId = msg.guild.id;
			const protectionKey = `protection:${guildId}`;
			
			// All available modules
			const modulesList = [
				'antijoin', 'antibots', 'antidelete', 'antiperms', 'antiedit', 
				'antilinks', 'antiword', 'antiemoji', 'antiinvite', 'smartban', 
				'antiraid', 'decay', 'verifybot', 'safemode', 'autocleanup', 
				'watchdog', 'rolefreeze', 'bblack', 'threatscore'
			];
			
			// Module categories
			const categories = {
				'User Protection': ['antijoin', 'antibots', 'bblack', 'verifybot', 'watchdog', 'threatscore'],
				'Server Structure': ['antidelete', 'antiperms', 'antiedit', 'rolefreeze', 'safemode'],
				'Content Filtering': ['antilinks', 'antiword', 'antiemoji', 'antiinvite'],
				'Anti-Raid': ['antiraid', 'smartban', 'decay', 'autocleanup']
			};
			
			if (action === 'list') {
				const settings = await this.client.redis.db.hgetall(protectionKey) || {};
				const globalEnabled = settings.enabled === '1';
				
				const embed = new EmbedBuilder()
					.setTitle('🛡️ Protection Modules')
					.setColor(globalEnabled ? 0x00AE86 : 0xE74C3C)
					.setDescription(`Protection system is currently **${globalEnabled ? 'ENABLED' : 'DISABLED'}**\n\nUse \`module enable/disable <moduleName>\` to configure modules.`)
					.setFooter({ text: 'Some modules may have additional configuration options' });
				
				// Add each category with its modules
				for (const [category, modules] of Object.entries(categories)) {
					const moduleList = modules.map(mod => {
						const status = settings[mod] === '1';
						return `${status ? '✅' : '❌'} **${mod}** - ${this.getModuleDescription(mod)}`;
					}).join('\n');
					
					embed.addFields({ name: `📋 ${category}`, value: moduleList, inline: false });
				}
				
				return msg.reply({ embeds: [embed] });
			}
			
			// If not listing, ensure a module name is provided
			if (!moduleName) {
				return msg.reply('Please specify a module name to enable or disable.');
			}
			
			// Check if the module exists
			if (!modulesList.includes(moduleName)) {
				return msg.reply(`Invalid module name. Available modules: ${modulesList.join(', ')}`);
			}
			
			// Enable or disable the module
			await this.client.redis.db.hset(protectionKey, moduleName, action === 'enable' ? '1' : '0');
			
			// Check if global protection is enabled
			const globalEnabled = await this.client.redis.db.hget(protectionKey, 'enabled') === '1';
			let responseText = `Module **${moduleName}** has been ${action === 'enable' ? 'enabled' : 'disabled'}.`;
			
			// Add warning if protection is disabled but enabling a module
			if (!globalEnabled && action === 'enable') {
				responseText += '\n\n⚠️ **Warning:** The global protection system is currently disabled. Enable it with `protection enable` for this module to take effect.';
			}
			
			return msg.reply(responseText);
			
		} catch (err) {
			return msg.reply(`Failed to ${action} module: ${err.message}`);
		}
	}
	
	getModuleDescription(module) {
		const descriptions = {
			antijoin: 'Ban or jail new suspicious accounts',
			antibots: 'Auto-kick unverified bots',
			antidelete: 'Prevent deletion of channels or roles',
			antiperms: 'Protect against role permission edits',
			antiedit: 'Prevent renaming roles or channels',
			antilinks: 'Block or filter harmful links',
			antiword: 'Auto-mute on banned words',
			antiemoji: 'Prevent emoji creation/deletion',
			antiinvite: 'Block external invite links',
			smartban: 'Ban users who trip multiple protections',
			antiraid: 'Detect mass-join behavior',
			decay: 'Act on inactive users',
			verifybot: 'Suspend unverified bots for approval',
			safemode: 'Full lockdown toggle',
			autocleanup: 'Prune inactive members',
			watchdog: 'Monitor suspicious users',
			rolefreeze: 'Prevent role changes',
			bblack: 'Block users from rejoining',
			threatscore: 'AI score for suspicious behavior'
		};
		return descriptions[module] || 'No description available';
	}
}; 