const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 1000,
    lazyConnect: true,
});

redis.on('connect', () => {
    console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

// Connect on import
redis.connect().catch((err) => {
    console.error('❌ Failed to connect to Redis:', err.message);
});

/**
 * Push a task job to the Redis queue.
 * @param {string} taskId - MongoDB task ID
 */
const pushToQueue = async (taskId) => {
    const job = JSON.stringify({ taskId, timestamp: new Date().toISOString() });
    await redis.lpush('task_queue', job);
    console.log(`📤 Job pushed to queue: ${taskId}`);
};

module.exports = { redis, pushToQueue };
