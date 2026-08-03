import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';

async function main() {
  console.log('Connecting to Elasticsearch...');
  const esUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
  const client = new Client({ node: esUrl });

  try {
    const indices = ['products', 'categories', 'brands'];
    for (const index of indices) {
      const exists = await client.indices.exists({ index });
      if (exists) {
        await client.indices.delete({ index });
        console.log(`Deleted index: ${index}`);
      }
    }
    console.log('Elasticsearch cleared successfully!');
  } catch (error) {
    console.error('Failed to clear Elasticsearch:', error);
  }
}

main().catch(console.error).finally(() => process.exit(0));
