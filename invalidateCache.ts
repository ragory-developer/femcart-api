import 'dotenv/config';
import { CacheService } from './src/core/redis/CacheService';
import { KeyFactory } from './src/core/redis/KeyFactory';
import { redis } from './src/core/redis/RedisManager';

async function main() {
  console.log('Incrementing product cache version...');
  await CacheService.incr(KeyFactory.productCacheVersion());
  
  console.log('Incrementing category cache version...');
  await CacheService.incr(KeyFactory.categoryCacheVersion());
  
  console.log('Incrementing brand cache version...');
  await CacheService.incr(KeyFactory.brandCacheVersion());

  console.log('Cache invalidated successfully!');
  setTimeout(() => process.exit(0), 500);
}

redis.on('ready', () => {
  console.log('Redis connected');
  main();
});
