import { CacheService } from './src/core/redis/CacheService';
import { KeyFactory } from './src/core/redis/KeyFactory';
import { redis } from './src/core/redis/RedisManager';
import crypto from 'crypto';

async function main() {
  const version = await CacheService.get<number>(KeyFactory.categoryCacheVersion()) || 1;
  console.log('Category Cache Version:', version);

  const queryHash = crypto.createHash('md5').update('').digest('hex');
  const cacheKey = KeyFactory.categoryList(`${version}:${queryHash}`);
  
  console.log('Cache Key for Category List:', cacheKey);

  const cachedList = await CacheService.get<any>(cacheKey);
  console.log('Cached List (length):', cachedList?.length);

  setTimeout(() => process.exit(0), 1000);
}

// wait for redis to connect
redis.on('ready', () => {
  console.log('Redis ready, executing test...');
  main();
});
