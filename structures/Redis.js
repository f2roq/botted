const Redis = require('ioredis');
const { REDIS_HOST, REDIS_PASS } = process.env;

class MockRedisDb {
	constructor() {
		this.data = {};
		this.sets = {};
		this.hashes = {};
	}

	async get(key) {
		return this.data[key] || null;
	}

	async set(key, value) {
		this.data[key] = value;
		return 'OK';
	}

	async del(key) {
		delete this.data[key];
		return 1;
	}

	async sadd(key, ...members) {
		if (!this.sets[key]) this.sets[key] = new Set();
		members.forEach(member => this.sets[key].add(member));
		return members.length;
	}

	async srem(key, ...members) {
		if (!this.sets[key]) return 0;
		let count = 0;
		members.forEach(member => {
			if (this.sets[key].has(member)) {
				this.sets[key].delete(member);
				count++;
			}
		});
		return count;
	}

	async smembers(key) {
		return this.sets[key] ? Array.from(this.sets[key]) : [];
	}

	async hset(key, field, value) {
		if (!this.hashes[key]) this.hashes[key] = {};
		this.hashes[key][field] = value;
		return 1;
	}

	async hget(key, field) {
		if (!this.hashes[key]) return null;
		return this.hashes[key][field] || null;
	}

	async hgetall(key) {
		return this.hashes[key] || {};
	}
}

module.exports = class RedisClient {
	constructor(client, host = REDIS_HOST, pass = REDIS_PASS) {
		Object.defineProperty(this, 'client', { value: client });

		try {
			this.db = new Redis({
				port: 6379,
				host,
				enableReadyCheck: true,
				password: pass,
				db: 0
			});
			this.db.on('connect', () => this.client.logger.info('[REDIS] Connecting...'));
			this.db.on('ready', () => this.client.logger.info('[REDIS] Ready!'));
			this.db.on('error', error => {
				this.client.logger.error(`[REDIS] Encountered error:\n${error}`);
				this.useMockDb();
			});
			this.db.on('reconnecting', () => this.client.logger.warn('[REDIS] Reconnecting...'));
		} catch (error) {
			this.client.logger.error(`[REDIS] Failed to initialize Redis:\n${error}`);
			this.useMockDb();
		}
	}

	useMockDb() {
		this.client.logger.warn('[REDIS] Using mock Redis implementation. Data will not persist between restarts.');
		this.db = new MockRedisDb();
	}
};
