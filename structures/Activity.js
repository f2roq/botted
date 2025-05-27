const { ActivityType } = require('discord.js');
const { formatNumber } = require('../util/Util');

module.exports = [
	{
		text: 'Tomb Raider',
		type: ActivityType.Playing
	},
	{
		text: 'Tomb Raider Anniversary',
		type: ActivityType.Playing
	},
	{
		text: 'Tomb Raider (VI) The Angel of Darkness',
		type: ActivityType.Playing
	},
	{
		text: 'Mr. Robot',
		type: ActivityType.Watching
	},
	{
		text: 'anime',
		type: ActivityType.Watching
	},
	{
		text: 'YOU.',
		type: ActivityType.Watching
	},
	{
		text: 'Disco Elysium',
		type: ActivityType.Playing
	},
	{
		text: 'Silent Hill 2',
		type: ActivityType.Playing
	},
	{
		text: 'Silent Hill',
		type: ActivityType.Playing
	},
	{
		text: 'with bynwkyow',
		type: ActivityType.Playing
	},
	{
		text: 'with Riven',
		type: ActivityType.Playing
	},
	{
		text: 'with Irelia',
		type: ActivityType.Playing
	},
	{
		text: 'with a mind',
		type: ActivityType.Playing
	},
	{
		text: 'with a mask',
		type: ActivityType.Playing
	},
	{
		text: client => `${formatNumber(client.guilds.cache.size)} servers`,
		type: ActivityType.Watching
	},
	{
		text: client => `with ${formatNumber(client.registry.commands.size)} commands`,
		type: ActivityType.Playing
	},
	{
		text: client => `with ${formatNumber(client.registry.totalUses)} command uses`,
		type: ActivityType.Playing
	}
];
