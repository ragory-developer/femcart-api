import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';

// Paths
const rawDataDir = "c:/Users/ragory/Downloads/scapped product data";
const outputFilePath = path.join(__dirname, 'realistic-scraped-data.ts');

console.log('🏁 Starting scraped data transformation with @faker-js/faker...');

// Define category structure matching what we have in realistic-data.ts
const existingCategories = [
  { name: 'Halal Meat', slug: 'halal-meat' },
  { name: 'Fresh Poultry', slug: 'fresh-poultry', parent: 'halal-meat' },
  { name: 'Fresh Beef', slug: 'fresh-beef', parent: 'halal-meat' },
  { name: 'Fresh Lamb', slug: 'fresh-lamb', parent: 'halal-meat' },
  { name: 'Fresh Goat', slug: 'fresh-goat', parent: 'halal-meat' },
  { name: 'Seafood', slug: 'seafood' },
  { name: 'Frozen Meat', slug: 'frozen-meat', parent: 'frozen-foods' },
  { name: 'Groceries', slug: 'groceries' },
  { name: 'Rice', slug: 'rice', parent: 'groceries' },
  { name: 'Basmati Rice', slug: 'basmati-rice', parent: 'rice' },
  { name: 'Jasmine Rice', slug: 'jasmine-rice', parent: 'rice' },
  { name: 'Lentils & Dal', slug: 'lentils-dal', parent: 'groceries' },
  { name: 'Flour & Atta', slug: 'flour-atta', parent: 'groceries' },
  { name: 'Bread & Bakery', slug: 'bread-bakery' },
  { name: 'Paratha & Roti', slug: 'paratha-roti', parent: 'bread-bakery' },
  { name: 'Spices & Seasonings', slug: 'spices-seasonings', parent: 'groceries' },
  { name: 'Whole Spices', slug: 'whole-spices', parent: 'spices-seasonings' },
  { name: 'Ground Spices', slug: 'ground-spices', parent: 'spices-seasonings' },
  { name: 'Mixed Spices', slug: 'mixed-spices', parent: 'spices-seasonings' },
  { name: 'Salt & Sugar', slug: 'salt-sugar', parent: 'groceries' },
  { name: 'Oil & Ghee', slug: 'oil-ghee', parent: 'groceries' },
  { name: 'Pickles & Chutneys', slug: 'pickles-chutneys', parent: 'groceries' },
  { name: 'Pastes & Sauces', slug: 'pastes-sauces', parent: 'groceries' },
  { name: 'Canned Goods', slug: 'canned-goods', parent: 'groceries' },
  { name: 'Snacks & Sweets', slug: 'snacks-sweets' },
  { name: 'Biscuits & Cookies', slug: 'biscuits-cookies', parent: 'snacks-sweets' },
  { name: 'Chips & Namkeen', slug: 'chips-namkeen', parent: 'snacks-sweets' },
  { name: 'Traditional Sweets', slug: 'traditional-sweets', parent: 'snacks-sweets' },
  { name: 'Beverages', slug: 'beverages' },
  { name: 'Tea', slug: 'tea', parent: 'beverages' },
  { name: 'Coffee', slug: 'coffee', parent: 'beverages' },
  { name: 'Juices', slug: 'juices', parent: 'beverages' },
  { name: 'Sodas & Syrups', slug: 'sodas-syrups', parent: 'beverages' },
  { name: 'Dairy & Eggs', slug: 'dairy-eggs' },
  { name: 'Milk', slug: 'milk', parent: 'dairy-eggs' },
  { name: 'Cheese', slug: 'cheese', parent: 'dairy-eggs' },
  { name: 'Butter & Margarine', slug: 'butter-margarine', parent: 'dairy-eggs' },
  { name: 'Yogurt', slug: 'yogurt', parent: 'dairy-eggs' },
  { name: 'Eggs', slug: 'eggs', parent: 'dairy-eggs' },
  { name: 'Frozen Foods', slug: 'frozen-foods' },
  { name: 'Frozen Vegetables', slug: 'frozen-vegetables', parent: 'frozen-foods' },
  { name: 'Frozen Snacks', slug: 'frozen-snacks', parent: 'frozen-foods' },
  { name: 'Fresh Produce', slug: 'fresh-produce' },
  { name: 'Fresh Vegetables', slug: 'fresh-vegetables', parent: 'fresh-produce' },
  { name: 'Fresh Fruits', slug: 'fresh-fruits', parent: 'fresh-produce' },
  { name: 'Herbs', slug: 'herbs', parent: 'fresh-produce' },
  { name: 'Personal Care', slug: 'personal-care' },
  { name: 'Hair Care', slug: 'hair-care', parent: 'personal-care' },
  { name: 'Skin Care', slug: 'skin-care', parent: 'personal-care' },
  { name: 'Oral Care', slug: 'oral-care', parent: 'personal-care' },
  { name: 'Household', slug: 'household' },
  { name: 'Cleaning Supplies', slug: 'cleaning-supplies', parent: 'household' },
];

// Perform topological sort on categories to ensure parents are always created before children
function sortCategories(cats: typeof existingCategories) {
  const sorted: typeof existingCategories = [];
  const visited = new Set<string>();
  
  function visit(slug: string) {
    if (visited.has(slug)) return;
    const cat = cats.find(c => c.slug === slug);
    if (!cat) return;
    
    if (cat.parent) {
      visit(cat.parent);
    }
    
    visited.add(slug);
    sorted.push(cat);
  }
  
  for (const cat of cats) {
    visit(cat.slug);
  }
  
  return sorted;
}

const sortedCategories = sortCategories(existingCategories);

const categoryKeywords: Record<string, string[]> = {
  'fresh-poultry': ['chicken', 'poultry', 'pigeon', 'duck', 'hen'],
  'fresh-beef': ['beef', 'cow'],
  'fresh-lamb': ['lamb', 'mutton', 'sheep'],
  'fresh-goat': ['goat', 'khashi'],
  'seafood': ['fish', 'shrimp', 'chingri', 'rui', 'bata', 'tuna', 'hilsha', 'lobster', 'crab', 'prawn', 'fish cut', 'ilish', 'ruhi'],
  'basmati-rice': ['basmati'],
  'jasmine-rice': ['jasmine'],
  'rice': ['rice', 'chal', 'miniket', 'nazirshail', 'chinigura', 'pulao'],
  'lentils-dal': ['dal', 'lentil', 'lentils', 'chana dal', 'moong dal', 'masoor', 'urad', 'khesari'],
  'flour-atta': ['atta', 'flour', 'besan', 'maida', 'suji', 'semolina'],
  'milk': ['milk', 'liquid milk', 'laban', 'matha', 'milk powder', 'uht milk'],
  'cheese': ['cheese', 'mozzarella', 'paneer', 'cheddar'],
  'butter-margarine': ['butter', 'ghee', 'margarine'],
  'yogurt': ['curd', 'yogurt', 'yoghurt', 'dahi', 'doi', 'tok doi', 'mishti doi'],
  'eggs': ['egg', 'eggs', 'dim'],
  'herbs': ['coriander', 'mint', 'curry leaves', 'cilantro', 'dhaniya', 'pudina'],
  'fresh-vegetables': ['potato', 'onion', 'garlic', 'ginger', 'lemon', 'cabbage', 'gourd', 'okra', 'chilli', 'karela', 'tomato', 'cauliflower', 'radish', 'carrot', 'spinach', 'squash', 'begun', 'eggplant', 'alu', 'piyaj', 'morich'],
  'fresh-fruits': ['dates', 'lychee', 'mango', 'banana', 'orange', 'apple', 'grape', 'papaya', 'guava', 'malta', 'coconut', 'dates', 'khejur', 'kola', 'aam'],
  'oil-ghee': ['oil', 'mustard oil', 'olive oil', 'sunflower oil', 'soyabean oil', 'tel'],
  'pastes-sauces': ['mayonnaise', 'sauce', 'ketchup', 'paste', 'kasundi'],
  'tea': ['tea', 'tea bags', 'cha', 'seylon'],
  'coffee': ['coffee', 'nescafe'],
  'juices': ['juice', 'lassi', 'nectar'],
  'sodas-syrups': ['soda', 'syrup', 'cola', 'rooh afza', 'limca', 'thums up', 'sprite', 'coke', 'fanta', 'pepsi', 'soft drink', 'beverage'],
  'biscuits-cookies': ['biscuit', 'cookie', 'dry cake', 'toast', 'cake', 'cookies', 'biscuits'],
  'chips-namkeen': ['chips', 'namkeen', 'chanachur', 'bhujia', 'kurkure', 'lays'],
  'traditional-sweets': ['sweet', 'gulab jamun', 'rasgulla', 'soan papdi', 'sweets', 'halwa', 'laddu'],
  'cleaning-supplies': ['detergent', 'soap', 'freshener', 'liquid', 'cleaner', 'dettol', 'vim', 'surf excel', 'odonil', 'harpic', 'wash', 'cleaning'],
};

const knownBrands = [
  'Aarong', 'Milk Vita', 'Pran', 'Shokti', 'Goodlife', 'Ultra', 'ACI Pure', 'Spanisha',
  'Funtastic', 'MJ\'s', 'Herman', 'Crown', 'Kent', 'Lady Anna', 'SIS', 'Seylon', 'Shan',
  'MDH', 'National', 'Haldiram\'s', 'Amul', 'Tilda', 'Daawat', 'Kohinoor', 'Maggi',
  'Knorr', 'Bombay Sweets', 'Laziza', 'Al Islami', 'Sadia', 'Seara', 'Almarai', 'Lipton',
  'Brooke Bond', 'Taj Mahal', 'Rooh Afza', 'Hemani', 'Dabur', 'Himalaya', 'Parachute',
  'Patanjali', 'Aashirvaad', 'Ziyad', 'Midamar', 'Al Safa', 'Ahmed Foods', 'ACI', 'Fresh',
  'Radhuni', 'Muzammel', 'Teer', 'Rupchanda', 'Olympic', 'Danish', 'Finlay', 'Ispahani',
  'Sunsilk', 'Dove', 'Lifebuoy', 'Dettol', 'Harpic', 'Wheel', 'Surf Excel', 'Vim',
  'Gillette', 'Pepsodent', 'Close-Up', 'Sensodyne', 'Meril'
];

function cleanPrice(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[৳\s,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function inferBrand(name: string): string | null {
  for (const b of knownBrands) {
    if (new RegExp('\\b' + b + '\\b', 'i').test(name)) {
      return b;
    }
  }
  const words = name.trim().split(/\s+/);
  if (words.length > 0) {
    const firstWord = words[0];
    const genericWords = ['fresh', 'premium', 'organic', 'green', 'whole', 'royal', 'local', 'beef', 'mutton', 'chicken', 'vegetable', 'fish', 'dates', 'egg', 'loose', 'pure', 'sweet', 'sour', 'mutton/kg', 'beef/kg', 'chicken/kg', 'potato', 'onion', 'garlic', 'dates', 'banana', 'lychee'];
    if (!genericWords.includes(firstWord.toLowerCase()) && firstWord.length > 2) {
      return firstWord;
    }
  }
  return null;
}

function cleanProductName(name: string): string {
  let cleaned = name.replace(/\s+/g, ' ').trim();
  if (cleaned === cleaned.toUpperCase()) {
    cleaned = cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cleaned;
}

function inferCategory(name: string, filename: string): string {
  const nameLower = name.toLowerCase();
  for (const [cat, regexes] of Object.entries(categoryKeywords)) {
    for (const r of regexes) {
      if (new RegExp('\\b' + r + '\\b', 'i').test(nameLower) || nameLower.includes(r)) {
        return cat;
      }
    }
  }
  
  const fileLower = filename.toLowerCase();
  if (fileLower.includes('vegitable') || fileLower.includes('vegetable')) return 'fresh-vegetables';
  if (fileLower.includes('fruit')) return 'fresh-fruits';
  if (fileLower.includes('fish')) return 'seafood';
  if (fileLower.includes('poultry') || fileLower.includes('chicken')) return 'fresh-poultry';
  if (fileLower.includes('meat')) {
    if (nameLower.includes('beef') || nameLower.includes('bone')) return 'fresh-beef';
    if (nameLower.includes('mutton') || nameLower.includes('lamb') || nameLower.includes('brain') || nameLower.includes('head')) return 'fresh-lamb';
    return 'halal-meat';
  }
  if (fileLower.includes('dairy')) {
    if (nameLower.includes('cheese') || nameLower.includes('paneer')) return 'cheese';
    if (nameLower.includes('butter') || nameLower.includes('ghee')) return 'butter-margarine';
    if (nameLower.includes('curd') || nameLower.includes('yogurt') || nameLower.includes('doi')) return 'yogurt';
    return 'milk';
  }
  if (fileLower.includes('chal') || fileLower.includes('rice')) return 'rice';
  
  return 'groceries';
}

function inferWeightUnit(name: string): { weight: string | null, unit: string } {
  const patterns = [
    /(\d+(?:\.\d+)?\s*(?:kg|gm|g|ml|l|ltr|oz|doz|pcs|pc|pkt|pack|box|combo|can|bgd))/i,
    /(\d+\s*x\s*\d+\s*(?:gm|g|ml|pcs))/i
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      const weight = match[0].trim();
      let unit = 'piece';
      const wl = weight.toLowerCase();
      if (wl.includes('kg')) unit = 'kg';
      else if (wl.includes('gm') || wl.includes('g')) unit = 'gm';
      else if (wl.includes('ml')) unit = 'ml';
      else if (wl.includes('ltr') || wl.includes('l')) unit = 'ltr';
      else if (wl.includes('pkt') || wl.includes('pack')) unit = 'pkt';
      else if (wl.includes('box')) unit = 'box';
      else if (wl.includes('doz')) unit = 'doz';
      else if (wl.includes('pcs') || wl.includes('pc')) unit = 'piece';
      return { weight, unit };
    }
  }
  
  if (name.toLowerCase().includes('loose')) {
    return { weight: '1 kg', unit: 'kg' };
  }
  if (name.toLowerCase().includes('per pc') || name.toLowerCase().includes('/pc')) {
    return { weight: '1 pc', unit: 'piece' };
  }
  
  return { weight: null, unit: 'piece' };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result.map(val => {
    if (val.startsWith('"') && val.endsWith('"')) {
      return val.substring(1, val.length - 1).replace(/""/g, '"');
    }
    return val;
  });
}

// Generate rich description using faker.js
function generateDescriptionWithFaker(name: string, category: string): string {
  const marketingSentence = faker.commerce.productDescription();
  const descParagraph = faker.lorem.paragraph(2);
  return `${marketingSentence} This high-grade ${name} is sourced directly from certified farms and processed under strict quality control standards. ${descParagraph}`;
}

// Generate FAQs using faker.js
function generateFAQsWithFaker(name: string, category: string): string {
  const faqs = [
    {
      q: `Is this ${name} fresh and authentic?`,
      a: `${faker.lorem.sentence()} Yes, we source it fresh daily and guarantee its authenticity.`
    },
    {
      q: `How long does this product last?`,
      a: `It has a standard shelf life of ${faker.number.int({ min: 3, max: 14 })} days when stored in a cool, dry place or refrigerated.`
    },
    {
      q: `Is this halal certified?`,
      a: `Yes, all food products available on HalaMart are 100% Halal certified and prepared according to Islamic dietary laws.`
    }
  ];
  return JSON.stringify(faqs);
}

// Generate Specifications using faker.js
function generateSpecificationsWithFaker(name: string, category: string, brand: string | null, weight: string | null, unit: string): string {
  const specs = {
    "Brand": brand || "HalaMart Select",
    "Packaging": "Vacuum Sealed Hygienic Packet",
    "Weight / Volume": weight || "Varies",
    "Product Code": `HM-${faker.string.alphanumeric(6).toUpperCase()}`,
    "Batch Number": `BT-${faker.number.int({ min: 1000, max: 9999 })}`,
    "Quality Grade": faker.helpers.arrayElement(["Premium Grade A", "Super Choice", "First Quality"])
  };
  return JSON.stringify(specs);
}

// Generate SEO metadata using faker.js
function generateSEOWithFaker(name: string, category: string, brand: string | null): string {
  const seo = {
    title: `${name} by ${brand || 'HalaMart'} - Buy Online`,
    description: `${faker.commerce.productAdjective()} ${name}. ${faker.lorem.sentence()}`,
    keywords: `${name.toLowerCase()}, buy ${name.toLowerCase()} online, ${category}, halal food, south florida grocery`
  };
  return JSON.stringify(seo);
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

// Global data maps
const processedBrands = new Map<string, { name: string, slug: string }>();
const processedProducts = new Map<string, any>();
const categoriesSet = new Set<string>();

for (const cat of sortedCategories) {
  categoriesSet.add(cat.slug);
}

function processCSVFile(filePath: string) {
  const filename = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
  
  if (lines.length < 2) return;
  
  const header = parseCSVLine(lines[0]);
  const headerMap: Record<string, number> = {};
  header.forEach((name, idx) => {
    headerMap[name.toLowerCase()] = idx;
  });
  
  const isShwapno = filename.includes('shwapno');
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < header.length) continue;
    
    let rawName = '';
    let rawPrice = '';
    let rawComparePrice = '';
    let rawImage = '';
    let startUrl = '';
    
    if (isShwapno) {
      rawName = cols[headerMap['data']];
      rawPrice = cols[headerMap['price']];
      rawComparePrice = headerMap['price2'] !== undefined ? cols[headerMap['price2']] : '';
      rawImage = cols[headerMap['image']];
      startUrl = headerMap['web_scraper_start_url'] !== undefined ? cols[headerMap['web_scraper_start_url']] : '';
    } else {
      const isRice = filename.includes('chal or rice');
      const titleCol = cols[headerMap['title']];
      const dataCol = isRice 
        ? cols[headerMap['data2']] 
        : (headerMap['data2'] !== undefined && headerMap['data2'] < cols.length ? cols[headerMap['data2']] : cols[headerMap['data']]);
      
      rawName = dataCol === 'Add To Cart' || !dataCol ? titleCol : dataCol;
      rawPrice = cols[headerMap['price']];
      rawImage = cols[headerMap['image']];
      startUrl = headerMap['web_scraper_start_url'] !== undefined ? cols[headerMap['web_scraper_start_url']] : '';
    }
    
    if (!rawName || rawName === 'Add To Cart') continue;
    
    const name = cleanProductName(rawName);
    const lowercaseName = name.toLowerCase();
    
    if (processedProducts.has(lowercaseName)) {
      continue;
    }
    
    const price = cleanPrice(rawPrice);
    if (price <= 0) continue;
    
    const comparePrice = rawComparePrice ? cleanPrice(rawComparePrice) : null;
    const { weight, unit } = inferWeightUnit(name);
    const categorySlug = inferCategory(name, filename);
    const brandName = inferBrand(name);
    
    let brandSlug: string | null = null;
    if (brandName) {
      brandSlug = generateSlug(brandName);
      if (!processedBrands.has(brandSlug)) {
        processedBrands.set(brandSlug, { name: brandName, slug: brandSlug });
      }
    }
    
    let image = rawImage;
    if (!image || image.includes('default_img.png') || image.includes('placeholder')) {
      const keyword = categorySlug.split('-').pop() || 'food';
      const idLock = Math.floor(Math.random() * 1000);
      image = `https://loremflickr.com/600/600/food,${keyword}?lock=${idLock}`;
    }
    
    const slug = generateSlug(name);
    const description = generateDescriptionWithFaker(name, categorySlug);
    const shortDescription = `Premium quality ${name} now available online at HalaMart. Enjoy zabiha halal grocery shopping.`;
    const faqs = generateFAQsWithFaker(name, categorySlug);
    const specifications = generateSpecificationsWithFaker(name, categorySlug, brandName, weight, unit);
    const seoData = generateSEOWithFaker(name, categorySlug, brandName);
    
    const stock = faker.number.int({ min: 10, max: 120 });
    const featured = Math.random() < 0.08;
    const isHalal = true;
    
    const productRecord = {
      name,
      slug,
      description,
      shortDescription,
      price,
      comparePrice,
      stock,
      image,
      images: JSON.stringify([image]),
      unit,
      weight,
      featured,
      isHalal,
      countryOfOrigin: name.includes('United Arab Emirates') ? 'United Arab Emirates' : (name.includes('Spain') ? 'Spain' : (name.includes('Turkey') ? 'Turkey' : (name.includes('Thailand') ? 'Thailand' : 'Bangladesh'))),
      categorySlug,
      brandSlug,
      faqs,
      specifications,
      seoData,
      externalId: cols[0]
    };
    
    processedProducts.set(lowercaseName, productRecord);
  }
}

// Execute parsing across all files
const files = fs.readdirSync(rawDataDir);
const csvFiles = files.filter(f => f.endsWith('.csv'));

console.log(`📂 Found ${csvFiles.length} CSV files to process.`);
for (const file of csvFiles) {
  const filePath = path.join(rawDataDir, file);
  console.log(`⏳ Parsing: ${file}...`);
  processCSVFile(filePath);
}

const finalProducts = Array.from(processedProducts.values());
const finalBrands = Array.from(processedBrands.values());

// Log summary
console.log('\n📊 Processing Complete:');
console.log(` - Unique Products: ${finalProducts.length}`);
console.log(` - Inferred Brands: ${finalBrands.length}`);

// Generate TypeScript Output
let fileContent = `// File automatically generated. Do not edit directly.

export const categories = ${JSON.stringify(sortedCategories, null, 2)};

export const brands = ${JSON.stringify(finalBrands, null, 2)};

export const products = ${JSON.stringify(finalProducts, null, 2)};
`;

fs.writeFileSync(outputFilePath, fileContent, 'utf8');
console.log(`💾 Seed data compiled and written to: ${outputFilePath}`);
