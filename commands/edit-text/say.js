const Command = require('../../framework/Command');

module.exports = class SayCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'say',
			aliases: ['copy', 'echo'],
			group: 'edit-text',
			description: 'Make me say what you want, master.',
			args: [
				{
					key: 'text',
					type: 'string'
				}
			]
		});
	}

	async run(msg, { text }) {
		try {
			if (msg.guild && msg.deletable) await msg.delete();
			return msg.say(text);
		} catch {
			return msg.say(text);
		}
	}
};
