const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class TrustListCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'trustlist',
			group: 'protection',
			description: 'Show the list of trusted users with their trust levels',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.Administrator]
		});
	}

	async run(msg) {
		try {
			const guildId = msg.guild.id;
			const trustedUsers = await this.client.redis.db.smembers(`protection:${guildId}:trusted`);
			const trustLevels = await this.client.redis.db.hgetall(`protection:${guildId}:trustlevels`);
			
			if (!trustedUsers.length) {
				return msg.reply('No users are currently in the trust list.');
			}
			
			// Get user information
			const userDetails = [];
			for (const userId of trustedUsers) {
				try {
					const user = await this.client.users.fetch(userId);
					const level = trustLevels[userId] || '1';
					userDetails.push({
						id: userId,
						tag: user.tag,
						level: parseInt(level, 10)
					});
				} catch (error) {
					userDetails.push({
						id: userId,
						tag: 'Unknown User',
						level: parseInt(trustLevels[userId] || '1', 10)
					});
				}
			}
			
			// Sort by trust level, highest first
			userDetails.sort((a, b) => b.level - a.level);
			
			const embed = new EmbedBuilder()
				.setTitle('👥 Trusted Users List')
				.setColor(0x00AE86)
				.setDescription('Users with special trust privileges and their trust levels')
				.setFooter({ text: `Total trusted users: ${trustedUsers.length}` });
			
			// Group users by trust level
			const levels = [5, 4, 3, 2, 1];
			for (const level of levels) {
				const usersAtLevel = userDetails.filter(user => user.level === level);
				if (usersAtLevel.length > 0) {
					embed.addFields({
						name: `Trust Level ${level} ${this.getTrustLevelEmoji(level)}`,
						value: usersAtLevel.map(user => `<@${user.id}> (${user.tag})`).join('\n'),
						inline: false
					});
				}
			}
			
			return msg.reply({ embeds: [embed] });
		} catch (err) {
			return msg.reply(`Failed to retrieve trusted users: ${err.message}`);
		}
	}
	
	getTrustLevelEmoji(level) {
		const emojis = {
			5: '🔶',  // Highest trust
			4: '🔹',
			3: '⭐',
			2: '✅',
			1: '⚪'   // Basic trust
		};
		return emojis[level] || '⚪';
	}
}; 