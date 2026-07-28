export const defaultHomePageConfig = {
  activeTemplate: "template_1",
  templateData: {
    template_1: {
      hero: { title: "Discover Natural Beauty", subtitle: "Premium skincare for your daily routine", imageSrc: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=80", ctaText: "Shop Now", ctaHref: "/categories/skin-care" },
      specialOffers: { title: "Special Offers", subtitle: "Up to 50% Off", leftImageSrc: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=300&q=80", rightImageSrc: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=300&q=80" },
      showcaseCategoryId: "all"
    },
    template_2: {
      hero: { title: "Pure. Simple. Effective.", subtitle: "The Essentials", imageSrc: "https://images.unsplash.com/photo-1615397323812-4217117f7b32?auto=format&fit=crop&w=1920&q=80", ctaText: "Shop Collection", ctaHref: "/products" },
      story: { title: "Embrace natural ingredients", text: "We believe in the power of nature. Our products are formulated with the highest quality organic ingredients, free from harsh chemicals and artificial fragrances. Just pure, skin-loving goodness.", imageSrc: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=800&q=80", ctaText: "Learn our story", ctaHref: "/about" },
      showcaseCategoryId: "all"
    },
    template_3: {
      hero: { title: "Clearance", subtitle: "Mega", text: "Up to 70% Off Storewide. No Code Needed.", ctaText: "Shop The Sale", ctaHref: "/products?sort=discount" },
      specialOffers: { title: "Buy 1 Get 1 Free", subtitle: "On selected items across the store. Mix and match your favorites!" },
      showcaseCategoryId: "all"
    }
  }
};
