export const categories = [
  // Intimate Apparel
  { name: 'Intimate Apparel', slug: 'intimate-apparel' },
  { name: 'Bras', slug: 'bras', parent: 'intimate-apparel' },
  { name: 'Cotton Bra', slug: 'cotton-bra', parent: 'bras', image: 'https://femecart.com/cdn/shop/collections/Seamless_Lift-Up_Bra_for_Women_7.jpg?v=1782035805&width=400' },
  { name: 'Non-Padded Bra', slug: 'non-padded-bra', parent: 'bras', image: 'https://femecart.com/cdn/shop/collections/ArielPremiumWingLaceBra_3.jpg?v=1782035126&width=400' },
  { name: 'Nursing Bra', slug: 'nursing-bra', parent: 'bras', image: 'https://femecart.com/cdn/shop/collections/SoftCottonFrontOpenNursingBra-femecart_2.jpg?v=1782026823&width=400' },
  { name: 'Push Up Bra', slug: 'push-up-bra', parent: 'bras', image: 'https://femecart.com/cdn/shop/collections/Ultra-ThinAdjustableWirelessBra_1.jpg?v=1782025689&width=400' },
  { name: 'Seamless Bra', slug: 'seamless-bra', parent: 'bras', image: 'https://femecart.com/cdn/shop/collections/SeamlessPushUpBraforWomen-femecart_1.jpg?v=1782035331&width=400' },
  { name: 'Sports Bra', slug: 'sports-bra-cat', parent: 'bras', image: 'https://femecart.com/cdn/shop/collections/Adjustable_Front_Zip_Sports_Bra_6.jpg?v=1782034999&width=400' },
  { name: 'Panties', slug: 'panties', parent: 'intimate-apparel' },
  { name: 'Cotton Panty', slug: 'cotton-panty', parent: 'panties', image: 'https://femecart.com/cdn/shop/collections/ImportedPremiumCottonBreathableWomen_sPanty_1.jpg?v=1782035640&width=400' },
  { name: 'Period Panty', slug: 'period-panty', parent: 'panties', image: 'https://femecart.com/cdn/shop/collections/Leakproof_Period_Panties.jpg?v=1782025713&width=400' },
  { name: 'Shaping Panty', slug: 'shaping-panty', parent: 'panties', image: 'https://femecart.com/cdn/shop/collections/MUNAFIE_Seamless_Safety_Pants_Underwear_for_women-femecart.jpg?v=1782027637&width=400' },
  { name: 'Lingerie Sets', slug: 'lingerie-sets', parent: 'intimate-apparel' },
  // Shapewear
  { name: 'Shapewear', slug: 'shapewear' },
  { name: 'Bodysuits', slug: 'bodysuits', parent: 'shapewear' },
  { name: 'Waist Cinchers', slug: 'waist-cinchers', parent: 'shapewear' },
  { name: 'Control Briefs', slug: 'control-briefs', parent: 'shapewear' },
  // Activewear
  { name: 'Activewear', slug: 'activewear' },
  { name: 'Sports Bras', slug: 'sports-bras', parent: 'activewear' },
  { name: 'Leggings', slug: 'leggings', parent: 'activewear' },
  { name: 'Active Tops', slug: 'active-tops', parent: 'activewear' },
  // Lounge & Sleepwear
  { name: 'Lounge & Sleepwear', slug: 'lounge-sleepwear' },
  { name: 'Pajama Sets', slug: 'pajama-sets', parent: 'lounge-sleepwear' },
  { name: 'Robes', slug: 'robes', parent: 'lounge-sleepwear' },
  { name: 'Loungewear', slug: 'loungewear', parent: 'lounge-sleepwear' },
  // Lifestyle Accessories
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Body Care', slug: 'body-care', parent: 'accessories' },
  { name: 'Hosiery', slug: 'hosiery', parent: 'accessories' },
];

export const brands = [
  { name: 'Femcart Basics', slug: 'femcart-basics', logo: 'https://placehold.co/400x200/F9F0F0/A05E5E?font=montserrat&text=Femcart+Basics' },
  { name: 'Femcart Luxe', slug: 'femcart-luxe', logo: 'https://placehold.co/400x200/F9F0F0/A05E5E?font=montserrat&text=Femcart+Luxe' },
  { name: 'Femcart Lab', slug: 'femcart-lab', logo: 'https://placehold.co/400x200/F9F0F0/A05E5E?font=montserrat&text=Femcart+Lab' },
  { name: 'Silk & Skin', slug: 'silk-skin', logo: 'https://placehold.co/400x200/F9F0F0/A05E5E?font=montserrat&text=Silk+%26+Skin' },
  { name: 'ActiveFlex', slug: 'activeflex', logo: 'https://placehold.co/400x200/F9F0F0/A05E5E?font=montserrat&text=ActiveFlex' },
  { name: 'Silhouette', slug: 'silhouette', logo: 'https://placehold.co/400x200/F9F0F0/A05E5E?font=montserrat&text=Silhouette' },
  { name: 'ComfortFit', slug: 'comfortfit', logo: 'https://placehold.co/400x200/F9F0F0/A05E5E?font=montserrat&text=ComfortFit' },
];

function generateProducts() {
  const products: any[] = [];
  
  const add = (name: string, price: number, cat: string, brand: string | null = null, desc: string = '', customKeyword: string | null = null) => {
    const keyword = customKeyword || cat.split('-').pop() || 'clothing';
    const imageId = Math.floor(Math.random() * 1000);
    // Using placehold.co for reliable placeholder images
    const imageUrl = `https://placehold.co/600x600/F9F0F0/A05E5E?font=montserrat&text=${encodeURIComponent(name)}`;

    products.push({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
      description: desc || `Premium quality ${name} available at Femcart.`,
      shortDescription: name,
      price,
      stock: Math.floor(Math.random() * 100) + 20,
      image: imageUrl,
      images: JSON.stringify([imageUrl]),
      unit: 'pcs',
      isHalal: false,
      featured: products.length % 7 === 0,
      specialPrice: Math.random() > 0.7 ? price * 0.85 : null,
      categorySlug: cat,
      brandSlug: brand
    });
  };

  // Intimate Apparel
  add('Seamless Everyday Bra', 45.00, 'seamless-bra', 'femcart-basics', 'Comfortable and seamless for daily wear.', 'bra');
  add('Lace Trim Balconette Bra', 65.00, 'non-padded-bra', 'femcart-luxe', 'Elegant lace detail with perfect support.', 'bra');
  add('Push-up Plunge Bra', 55.00, 'push-up-bra', 'femcart-basics', 'Enhance your natural shape.', 'bra');
  add('Wireless Cotton Bralette', 35.00, 'cotton-bra', 'femcart-basics', 'Breathable cotton without the wires.', 'bralette');
  add('Soft Cotton Nursing Bra', 40.00, 'nursing-bra', 'femcart-lab', 'Convenient and comfortable nursing bra.', 'bra');
  
  add('Cotton Boyshort Panty', 15.00, 'cotton-panty', 'femcart-basics', 'Full coverage everyday comfort.', 'panties');
  add('Lace Thong', 18.00, 'panties', 'femcart-luxe', 'Invisible under clothing.', 'lingerie');
  add('High-Waisted Control Brief', 25.00, 'shaping-panty', 'comfortfit', 'Smoothing support for all-day wear.', 'panties');
  add('Seamless Bikini Panty 3-Pack', 35.00, 'panties', 'femcart-basics', 'Value pack of seamless panties.', 'panties');
  add('Leakproof Period Panty', 22.00, 'period-panty', 'femcart-lab', 'Ultimate leak protection and comfort.', 'panties');
  
  add('Silk Satin Lingerie Set', 95.00, 'lingerie-sets', 'silk-skin', 'Luxurious silk set.', 'lingerie');
  add('Floral Lace Bodysuit', 75.00, 'lingerie-sets', 'femcart-luxe', 'Stunning floral lace one-piece.', 'bodysuit');
  
  // Shapewear
  add('Full Body Shaper', 85.00, 'bodysuits', 'silhouette', 'Total body smoothing and contouring.', 'shapewear');
  add('Sculpting Mid-Thigh Bodysuit', 95.00, 'bodysuits', 'silhouette', 'Firm control bodysuit.', 'shapewear');
  add('Latex Waist Cincher', 65.00, 'waist-cinchers', 'femcart-lab', 'High compression waist trainer.', 'corset');
  add('Everyday Smoothing Brief', 35.00, 'control-briefs', 'comfortfit', 'Gentle tummy control.', 'shapewear');
  
  // Activewear
  add('High Impact Sports Bra', 55.00, 'sports-bra-cat', 'activeflex', 'Maximum support for intense workouts.', 'sportsbra');
  add('Seamless Yoga Bra', 45.00, 'sports-bra-cat', 'activeflex', 'Flexible and breathable for yoga.', 'sportsbra');
  add('High-Waisted Compression Leggings', 75.00, 'leggings', 'activeflex', 'Squat-proof and shaping.', 'leggings');
  add('Seamless Ribbed Leggings', 65.00, 'leggings', 'activeflex', 'Trendy ribbed texture.', 'leggings');
  add('Breathable Crop Tank', 35.00, 'active-tops', 'activeflex', 'Lightweight performance fabric.', 'activewear');
  add('Long Sleeve Workout Top', 45.00, 'active-tops', 'activeflex', 'Moisture-wicking long sleeve.', 'activewear');
  
  // Lounge & Sleepwear
  add('Silk Pajama Set', 125.00, 'pajama-sets', 'silk-skin', '100% pure silk sleepwear.', 'pajamas');
  add('Cotton Modal Sleep Shirt', 45.00, 'pajama-sets', 'femcart-basics', 'Ultra-soft sleep shirt.', 'pajamas');
  add('Plush Fleece Robe', 85.00, 'robes', 'comfortfit', 'Cozy up in our plush robe.', 'robe');
  add('Satin Kimono Robe', 65.00, 'robes', 'femcart-luxe', 'Elegant lounging.', 'robe');
  add('Cashmere Blend Lounge Pants', 110.00, 'loungewear', 'femcart-luxe', 'Luxury lounging essentials.', 'loungewear');
  add('Ribbed Knit Lounge Top', 55.00, 'loungewear', 'femcart-basics', 'Versatile ribbed top.', 'loungewear');
  
  // Lifestyle Accessories
  add('Nourishing Body Oil', 30.00, 'body-care', 'silk-skin', 'Hydrate and glow.', 'skincare');
  add('Exfoliating Body Scrub', 25.00, 'body-care', 'silk-skin', 'Smooth and renew skin.', 'skincare');
  add('Sheer Tights', 20.00, 'hosiery', 'femcart-basics', 'Durable sheer tights.', 'hosiery');
  add('Fleece-Lined Winter Leggings', 40.00, 'hosiery', 'comfortfit', 'Stay warm and stylish.', 'leggings');

  return products;
}

export const products = generateProducts();