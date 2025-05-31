const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class RoleBypassCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'rolebypass',
			group: 'protection',
			description: 'Add or remove roles that can bypass protection rules',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator],
			args: [
				{
					key: 'action',
					type: 'string',
					oneOf: ['add', 'remove', 'list'],
					prompt: 'What would you like to do? (add/remove/list)',
					default: 'list'
				},
				{
					key: 'role',
					type: 'role',
					prompt: 'Which role should bypass protection rules?',
					default: ''
				},
				{
					key: 'module',
					type: 'string',
					prompt: 'Which module should this role bypass? (use "all" for all modules)',
					default: 'all'
				}
			]
		});
	}

	async run(msg, { action, role, module }) {
		try {
			const guildId = msg.guild.id;
			const bypassKey = `protection:${guildId}:rolebypass`;
			
			// All available modules
			const modulesList = [
				'all', 'antijoin', 'antibots', 'antidelete', 'antiperms', 'antiedit', 
				'antilinks', 'antiword', 'antiemoji', 'antiinvite', 'smartban', 
				'antiraid', 'decay', 'verifybot', 'safemode', 'autocleanup', 
				'watchdog', 'rolefreeze', 'bblack', 'threatscore'
			];
			
			if (action === 'list') {
				// Get all bypass roles and their associated modules
				const allBypassRoles = await this.client.redis.db.hgetall(bypassKey) || {};
				const roleModules = {};
				
				// Process the data into a more usable format
				for (const [key, value] of Object.entries(allBypassRoles)) {
					const [roleId, mod] = key.split(':');
					if (!roleModules[roleId]) {
						roleModules[roleId] = [];
					}
					roleModules[roleId].push(mod);
				}
				
				// Check if there are any bypass roles
				if (Object.keys(roleModules).length === 0) {
					return msg.reply('No roles are currently set to bypass protection rules.');
				}
				
				// Create embed
				const embed = new EmbedBuilder()
					.setTitle('🔓 Protection Bypass Roles')
					.setColor(0x00AE86)
					.setDescription('Roles that can bypass specific protection modules');
				
				// Add each role and its bypassed modules
				for (const [roleId, mods] of Object.entries(roleModules)) {
					try {
						const roleObj = await msg.guild.roles.fetch(roleId);
						const isGlobalBypass = mods.includes('all');
						let moduleText;
						
						if (isGlobalBypass) {
							moduleText = '**All protection modules**';
						} else {
							moduleText = mods.map(m => `\`${m}\``).join(', ');
						}
						
						embed.addFields({
							name: `${roleObj.name} ${isGlobalBypass ? '(Global Bypass)' : ''}`,
							value: moduleText,
							inline: false
						});
					} catch (error) {
						// Role doesn't exist anymore
						// We should clean up the database
						for (const mod of mods) {
							await this.client.redis.db.hdel(bypassKey, `${roleId}:${mod}`);
						}
					}
				}
				
				return msg.reply({ embeds: [embed] });
			}
			
			// Check if required arguments are provided
			if (!role) {
				return msg.reply('Please specify a role to add or remove from the bypass list.');
			}
			
			// Check if the module is valid
			if (!modulesList.includes(module)) {
				return msg.reply(`Invalid module. Available modules: ${modulesList.join(', ')}`);
			}
			
			if (action === 'add') {
				if (module === 'all') {
					// Clear any existing module-specific bypasses for this role
					for (const mod of modulesList) {
						if (mod !== 'all') {
							await this.client.redis.db.hdel(bypassKey, `${role.id}:${mod}`);
						}
					}
					// Set global bypass
					await this.client.redis.db.hset(bypassKey, `${role.id}:all`, '1');
					return msg.reply(`Role ${role.name} will now bypass **all** protection modules.`);
				} else {
					// Check if the role already has global bypass
					const hasGlobalBypass = await this.client.redis.db.hexists(bypassKey, `${role.id}:all`);
					if (hasGlobalBypass) {
						return msg.reply(`Role ${role.name} already has a global bypass for all modules. Remove the global bypass first if you want to set module-specific bypasses.`);
					}
					
					// Add module-specific bypass
					await this.client.redis.db.hset(bypassKey, `${role.id}:${module}`, '1');
					return msg.reply(`Role ${role.name} will now bypass the ${module} module.`);
				}
			} else if (action === 'remove') {
				if (module === 'all') {
					// Remove all bypasses for this role
					for (const mod of modulesList) {
						await this.client.redis.db.hdel(bypassKey, `${role.id}:${mod}`);
					}
					return msg.reply(`All protection bypasses have been removed from role ${role.name}.`);
				} else {
					// Remove specific module bypass
					await this.client.redis.db.hdel(bypassKey, `${role.id}:${module}`);
					return msg.reply(`Role ${role.name} will no longer bypass the ${module} module.`);
				}
			}
		} catch (err) {
			return msg.reply(`Failed to ${action} role bypass: ${err.message}`);
		}
	}
}; 