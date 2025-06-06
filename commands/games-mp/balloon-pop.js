const Command = require('../../framework/Command');
const { Collection } = require('@discordjs/collection');
const { randomRange, verify, awaitPlayers } = require('../../util/Util');

module.exports = class BalloonPopCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'balloon-pop',
			aliases: ['balloons'],
			group: 'games-mp',
			description: 'Don\'t let yourself be the last one to pump the balloon before it pops!',
			game: true,
			credit: [
				{
					name: 'PAC-MAN Party',
					url: 'http://pacman.com/en/pac-man-games/pac-man-party',
					reason: 'Concept'
				}
			],
			args: [
				{
					key: 'playersCount',
					type: 'integer',
					min: 2,
					max: 100
				}
			]
		});
	}

	async run(msg, { playersCount }) {
		const awaitedPlayers = await awaitPlayers(msg, playersCount, 2, this.client.blacklist.user);
		if (!awaitedPlayers) return msg.say('Game could not be started...');
		const players = new Collection();
		for (const player of awaitedPlayers) {
			players.set(player, {
				pumps: 0,
				id: player,
				user: await this.client.users.fetch(player)
			});
		}
		let loser = null;
		let remains = players.size * 250;
		let turns = 0;
		const rotation = players.map(player => player.id);
		while (!loser) {
			const user = players.get(rotation[0]);
			let pump;
			++turns;
			if (turns === 1) {
				await msg.say(`${user.user} pumps the balloon!`);
				pump = true;
			} else {
				await msg.say(`${user.user}, do you pump the balloon again?`);
				pump = await verify(msg.channel, user.user);
			}
			if (pump) {
				remains -= randomRange(10, 100);
				const popped = Math.floor(Math.random() * remains);
				if (popped <= 0) {
					await msg.say('The balloon pops!');
					loser = user;
					break;
				}
				if (turns >= 5) {
					await msg.say(`${user.user} steps back!`);
					turns = 0;
					rotation.shift();
					rotation.push(user.id);
				}
			} else {
				await msg.say(`${user.user} steps back!`);
				turns = 0;
				rotation.shift();
				rotation.push(user.id);
			}
		}
		return msg.say(`And the loser is... ${loser.user}! Great job everyone else!`);
	}
};
