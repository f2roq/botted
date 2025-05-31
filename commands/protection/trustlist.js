const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class TrustListCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'trustlist',
			group: 'protection',
			description: 'Show the list of trusted users',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator]
		});
	}

	async run(msg) {
		try {
			const trustedUsers = await this.client.redis.db.smembers(`protection:${msg.guild.id}:trusted`);
			
			const embed = new EmbedBuilder()
				.setTitle('Trusted Users List')
				.setColor(0x00AE86)
				.setDescription(trustedUsers.length 
					? trustedUsers.map(id => `<@${id}>`).join('\n') 
					: 'No users in the trust list.');
			
			return msg.reply({ embeds: [embed] });
		} catch (err) {
			return msg.reply(`Failed to retrieve trusted users: ${err.message}`);
		}
	}
}; 