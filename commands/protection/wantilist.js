const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class WantiListCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'wantilist',
			group: 'protection',
			description: 'Show list of users who can delete roles or channels',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator]
		});
	}

	async run(msg) {
		try {
			const allowedUsers = await this.client.redis.db.smembers(`protection:${msg.guild.id}:wanti:allowed`);
			
			if (!allowedUsers.length) {
				return msg.reply('No users are currently allowed to delete roles or channels.');
			}
			
			const embed = new EmbedBuilder()
				.setTitle('Users Allowed to Delete Roles/Channels')
				.setColor(0x00AE86)
				.setDescription(allowedUsers.length 
					? allowedUsers.map(id => `<@${id}>`).join('\n') 
					: 'No users in the list.');
			
			return msg.reply({ embeds: [embed] });
		} catch (err) {
			return msg.reply(`Failed to retrieve allowed users: ${err.message}`);
		}
	}
}; 