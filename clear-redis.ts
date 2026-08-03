import 'dotenv/config';
import { redis } from './src/core/redis/RedisManager';

async function main() {
  console.log('Connecting to Redis...');
  await redis.flushall();
  console.log('Redis cleared successfully!');
}

main().catch(console.error).finally(() => process.exit(0));
