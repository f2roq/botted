const Command = require('../../framework/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = class ThreatScoreCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'threatscore',
			group: 'protection',
			description: 'Check the AI-generated threat score of a user',
			guildOnly: true,
			userPermissions: [PermissionFlagsBits.ModerateMembers],
			args: [
				{
					key: 'user',
					type: 'user',
					prompt: 'Which user would you like to analyze?'
				},
				{
					key: 'action',
					type: 'string',
					oneOf: ['view', 'scan', 'reset'],
					prompt: 'What would you like to do? (view/scan/reset)',
					default: 'view'
				}
			]
		});
	}

	async run(msg, { user, action }) {
		try {
			const guildId = msg.guild.id;
			const threatKey = `protection:${guildId}:threatscore`;
			
			// Check if the user is a bot
			if (user.bot) {
				return msg.reply('Threat scoring is not available for bot accounts.');
			}
			
			if (action === 'view') {
				// Get existing threat score
				const threatData = await this.client.redis.db.hgetall(`${threatKey}:${user.id}`) || {};
				
				if (!threatData.score) {
					return msg.reply(`No threat score available for ${user.tag}. Use \`threatscore ${user.tag} scan\` to analyze this user.`);
				}
				
				return this.displayThreatScore(msg, user, threatData);
			}
			
			else if (action === 'scan') {
				await msg.reply(`🔍 Analyzing user ${user.tag}... This may take a moment.`);
				
				// Calculate threat score based on various factors
				const threatData = await this.calculateThreatScore(msg.guild, user);
				
				// Save the score data
				await this.saveThreatData(guildId, user.id, threatData);
				
				return this.displayThreatScore(msg, user, threatData);
			}
			
			else if (action === 'reset') {
				// Reset threat score
				await this.client.redis.db.del(`${threatKey}:${user.id}`);
				return msg.reply(`Threat score for ${user.tag} has been reset.`);
			}
			
		} catch (err) {
			return msg.reply(`Failed to analyze threat score: ${err.message}`);
		}
	}
	
	async displayThreatScore(msg, user, threatData) {
		const score = parseInt(threatData.score);
		let riskLevel = 'Unknown';
		let color = 0x808080;
		
		// Determine risk level and color based on score
		if (score < 20) {
			riskLevel = 'Very Low';
			color = 0x00FF00;
		} else if (score < 40) {
			riskLevel = 'Low';
			color = 0x7FFF00;
		} else if (score < 60) {
			riskLevel = 'Moderate';
			color = 0xFFFF00;
		} else if (score < 80) {
			riskLevel = 'High';
			color = 0xFF7F00;
		} else {
			riskLevel = 'Very High';
			color = 0xFF0000;
		}
		
		const embed = new EmbedBuilder()
			.setTitle(`Threat Analysis: ${user.tag}`)
			.setThumbnail(user.displayAvatarURL({ dynamic: true }))
			.setColor(color)
			.setDescription(`AI-based security analysis for this user`)
			.addFields(
				{ name: 'Threat Score', value: `${score}/100`, inline: true },
				{ name: 'Risk Level', value: riskLevel, inline: true },
				{ name: 'Last Updated', value: new Date(parseInt(threatData.timestamp)).toLocaleString(), inline: true }
			)
			.setFooter({ text: 'Based on AI analysis of user behavior and account characteristics' });
		
		// Add factors if they exist
		if (threatData.factors) {
			const factors = JSON.parse(threatData.factors);
			
			// Format each factor category
			for (const [category, items] of Object.entries(factors)) {
				const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
				
				let fieldValue = '';
				for (const [item, value] of Object.entries(items)) {
					const formattedItem = item.charAt(0).toUpperCase() + item.slice(1).replace(/_/g, ' ');
					fieldValue += `**${formattedItem}**: ${value}\n`;
				}
				
				embed.addFields({ name: formattedCategory, value: fieldValue, inline: false });
			}
		}
		
		// Add recommendations if they exist
		if (threatData.recommendations) {
			embed.addFields({ 
				name: '🛡️ Security Recommendations', 
				value: threatData.recommendations, 
				inline: false 
			});
		}
		
		return msg.reply({ embeds: [embed] });
	}
	
	async calculateThreatScore(guild, user) {
		// Get member object
		const member = await guild.members.fetch(user.id).catch(() => null);
		
		// Start with base factors
		const factors = {
			account: {},
			activity: {},
			permissions: {},
			behavior: {}
		};
		
		let totalScore = 0;
		
		// Account age factor (newer accounts are higher risk)
		const accountAge = Date.now() - user.createdTimestamp;
		const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
		let accountAgeScore = 0;
		
		if (accountAgeDays < 1) {
			accountAgeScore = 25; // Very new account (less than a day)
		} else if (accountAgeDays < 7) {
			accountAgeScore = 20; // New account (less than a week)
		} else if (accountAgeDays < 30) {
			accountAgeScore = 15; // Relatively new (less than a month)
		} else if (accountAgeDays < 90) {
			accountAgeScore = 10; // Less than 3 months
		} else if (accountAgeDays < 365) {
			accountAgeScore = 5; // Less than a year
		}
		
		factors.account.age_score = accountAgeScore;
		totalScore += accountAgeScore;
		
		// Server join time relative to account creation
		if (member) {
			const joinAge = member.joinedTimestamp - user.createdTimestamp;
			const joinAgeDays = Math.floor(joinAge / (1000 * 60 * 60 * 24));
			let joinAgeScore = 0;
			
			if (joinAgeDays < 1) {
				joinAgeScore = 15; // Joined very soon after account creation
			} else if (joinAgeDays < 3) {
				joinAgeScore = 10; // Joined within days of creation
			} else if (joinAgeDays < 7) {
				joinAgeScore = 5; // Joined within a week of creation
			}
			
			factors.account.join_timing_score = joinAgeScore;
			totalScore += joinAgeScore;
			
			// Check if username contains suspicious patterns
			const usernameRiskScore = this.calculateUsernameRisk(user.username);
			factors.account.username_risk = usernameRiskScore;
			totalScore += usernameRiskScore;
			
			// Server-specific activity
			if (member.roles.cache.size <= 1) {
				// Only has @everyone role
				factors.activity.no_roles = 5;
				totalScore += 5;
			}
			
			// Calculate time in server
			const timeInServer = Date.now() - member.joinedTimestamp;
			const daysInServer = Math.floor(timeInServer / (1000 * 60 * 60 * 24));
			factors.activity.days_in_server = daysInServer;
			
			// Get message count and warning history from Redis
			const userMessages = await this.client.redis.db.get(`stats:${guild.id}:${user.id}:messages`) || '0';
			const messageCount = parseInt(userMessages);
			factors.activity.message_count = messageCount;
			
			// Low activity score
			if (daysInServer > 7 && messageCount < 10) {
				factors.activity.low_activity_score = 10;
				totalScore += 10;
			}
			
			// Check for warnings or previous violations
			const warnings = await this.client.redis.db.get(`warns:${guild.id}:${user.id}`) || '0';
			const warningCount = parseInt(warnings);
			
			if (warningCount > 0) {
				const warnScore = Math.min(warningCount * 5, 20); // Cap at 20 points
				factors.behavior.warning_score = warnScore;
				totalScore += warnScore;
			}
			
			// Check for previous protection triggers
			const protectionTriggers = await this.client.redis.db.get(`protection:${guild.id}:triggers:${user.id}`) || '0';
			const triggerCount = parseInt(protectionTriggers);
			
			if (triggerCount > 0) {
				const triggerScore = Math.min(triggerCount * 7, 25); // Cap at 25 points
				factors.behavior.protection_triggers = triggerScore;
				totalScore += triggerScore;
			}
			
			// Check for dangerous permissions
			if (member.permissions.has(PermissionFlagsBits.Administrator)) {
				factors.permissions.administrator = 0; // No penalty for admins as they're trusted
			} else if (member.permissions.has(PermissionFlagsBits.ManageGuild) || 
					  member.permissions.has(PermissionFlagsBits.ManageRoles) ||
					  member.permissions.has(PermissionFlagsBits.ManageChannels)) {
				factors.permissions.high_permissions = -10; // Actually reduce score for trusted users
				totalScore -= 10;
			}
		}
		
		// Check if user is in trust list
		const isTrusted = await this.client.redis.db.sismember(`protection:${guild.id}:trusted`, user.id);
		if (isTrusted) {
			const trustLevel = await this.client.redis.db.hget(`protection:${guild.id}:trustlevels`, user.id) || '1';
			const trustScore = parseInt(trustLevel) * -10; // -10 to -50 depending on trust level
			factors.permissions.trust_level_bonus = trustScore;
			totalScore += trustScore;
		}
		
		// Cap the total score between 0 and 100
		totalScore = Math.max(0, Math.min(100, totalScore));
		
		// Generate recommendations based on the score
		let recommendations = '';
		if (totalScore >= 80) {
			recommendations = 'This user poses a significant security risk. Consider removing them from the server or applying strict monitoring.';
		} else if (totalScore >= 60) {
			recommendations = 'This user shows concerning behavior patterns. Add them to a watchlist and limit their permissions.';
		} else if (totalScore >= 40) {
			recommendations = 'Some risk factors detected. Monitor this user\'s activity and consider adding them to the watchdog list.';
		} else if (totalScore >= 20) {
			recommendations = 'Low risk level detected. Normal monitoring is sufficient.';
		} else {
			recommendations = 'This user appears trustworthy based on our analysis. No special actions needed.';
		}
		
		return {
			score: totalScore.toString(),
			timestamp: Date.now().toString(),
			factors: JSON.stringify(factors),
			recommendations
		};
	}
	
	calculateUsernameRisk(username) {
		let score = 0;
		
		// Check for excessively similar characters (e.g., lllllll)
		const repeatedCharsRegex = /(.)\1{5,}/;
		if (repeatedCharsRegex.test(username)) {
			score += 5;
		}
		
		// Check for excessive numbers
		const numbersCount = (username.match(/\d/g) || []).length;
		if (numbersCount > 5) {
			score += 3;
		}
		
		// Check for known phishing patterns
		const phishingPatterns = ['nitro', 'free', 'steam', 'gift', 'admin'];
		for (const pattern of phishingPatterns) {
			if (username.toLowerCase().includes(pattern)) {
				score += 4;
				break;
			}
		}
		
		// Check for non-alphanumeric character density
		const specialChars = (username.match(/[^a-zA-Z0-9]/g) || []).length;
		const specialCharRatio = specialChars / username.length;
		if (specialCharRatio > 0.3) {
			score += 3;
		}
		
		return score;
	}
	
	async saveThreatData(guildId, userId, threatData) {
		const threatKey = `protection:${guildId}:threatscore`;
		
		// Save each piece of data
		for (const [key, value] of Object.entries(threatData)) {
			await this.client.redis.db.hset(`${threatKey}:${userId}`, key, value);
		}
		
		// If score is high, add to watchlist
		const score = parseInt(threatData.score);
		if (score >= 70) {
			// Check if watchdog module is enabled
			const watchdogEnabled = await this.client.redis.db.hget(`protection:${guildId}`, 'watchdog') === '1';
			if (watchdogEnabled) {
				await this.client.redis.db.sadd(`protection:${guildId}:watchdog`, userId);
				
				// Log to protection log channel
				this.logHighThreatUser(guildId, userId, score);
			}
		}
	}
	
	async logHighThreatUser(guildId, userId, score) {
		try {
			const logChannelId = await this.client.redis.db.get(`protection:${guildId}:logchannel`);
			if (!logChannelId) return;
			
			const guild = await this.client.guilds.fetch(guildId);
			if (!guild) return;
			
			const logChannel = await guild.channels.fetch(logChannelId);
			if (!logChannel) return;
			
			const user = await this.client.users.fetch(userId);
			
			const embed = new EmbedBuilder()
				.setTitle('⚠️ High Threat User Detected')
				.setColor(0xFF0000)
				.setDescription(`A user with a high threat score has been automatically added to the watchlist.`)
				.addFields(
					{ name: 'User', value: `${user.tag} (${user.id})`, inline: true },
					{ name: 'Threat Score', value: `${score}/100`, inline: true },
					{ name: 'Auto-action', value: 'Added to watchdog monitoring', inline: true }
				)
				.setTimestamp();
			
			await logChannel.send({ embeds: [embed] });
		} catch (error) {
			this.client.logger.error(`Failed to log high threat user: ${error}`);
		}
	}
}; 