# Page Builder Component Authoring Guide

This guide walks through how to register and author a new component section or design variant in the Fresh Market Page Builder.

---

## 1. Registry Architecture
The builder relies on a unified registry in [frontend/src/page-builder/registry.tsx](file:///d:/Rasel%20Mahmud%20Shanto/e-commerce-fresh-market/frontend/src/page-builder/registry.tsx) that coordinates:
1. **Section Definitions**: Meta information, layout category, component variants, and custom properties editor.
2. **Dynamic Prop Resolvers**: Data mapping, remote content fetching (e.g. database categories), and filtering/sorting logic.
3. **Migrators**: Backwards compatibility helpers that upgrade legacy document configurations safely.

---

## 2. Registering a New Section

To add a new component block to the library (e.g., `BrandShowcase`):

### Step A: Define your Types
Ensure that your props are explicitly defined in a TS interface:
```typescript
// Define component specific fields
export interface BrandShowcaseProps {
  title: string;
  brands: Array<{ name: string; logoUrl: string; link: string }>;
  grayscaleLogos?: boolean;
}
```

### Step B: Create your Renderer Component
Create a component under `src/components/home/` (or `src/components/ui/`) that renders the visual UI. Ensure it is responsive and matches our premium aesthetics (subtle grid gaps, transition durations on hover, HSL-harmonious tones).

```tsx
import React from 'react';

export function BrandShowcaseClassic({ title, brands, grayscaleLogos }: BrandShowcaseProps) {
  return (
    <div className="py-8">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {brands.map((brand, i) => (
          <a key={i} href={brand.link} className="flex items-center justify-center p-4 bg-white rounded-lg shadow-sm border border-gray-150 transition hover:shadow-md hover:border-emerald-500">
            <img 
              src={brand.logoUrl} 
              alt={brand.name} 
              className={`h-12 object-contain transition ${grayscaleLogos ? 'grayscale hover:grayscale-0' : ''}`}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
```

### Step C: Create the Section Editor Component
Create the properties panel editor inside [editors.tsx](file:///d:/Rasel%20Mahmud%20Shanto/e-commerce-fresh-market/frontend/src/page-builder/editors.tsx) or as an inline component. Use standard editor fields like `InputField`, `SegmentedControl`, or `MediaPickerField`:

```tsx
import { SectionEditorProps } from "./types";
import { InputField, SegmentedControl } from "./editors";

export function BrandShowcaseEditor({ props, onChange }: SectionEditorProps<BrandShowcaseProps>) {
  return (
    <div className="space-y-4">
      <InputField
        label="Section Title"
        value={props.title || ""}
        onChange={(val) => onChange({ title: val })}
        placeholder="Our Trusted Partners"
      />
      <SegmentedControl
        label="Grayscale Logo Style"
        value={props.grayscaleLogos ? "yes" : "no"}
        options={[
          { label: "Grayscale (Hover Color)", value: "yes" },
          { label: "Full Color Always", value: "no" },
        ]}
        onChange={(val) => onChange({ grayscaleLogos: val === "yes" })}
      />
    </div>
  );
}
```

### Step D: Register the Component in `registry.tsx`
Add your configuration entry inside the `sectionRegistry` record:

```tsx
export const sectionRegistry: Record<string, SectionDefinition<any>> = {
  // ... other components ...
  BrandShowcase: {
    type: "BrandShowcase",
    label: "Brand Showcase",
    description: "Display partner brands and distributor logos with optional grayscale animations.",
    category: "Marketing",
    contentKind: "static",
    defaultVariant: "classic",
    variants: {
      classic: {
        label: "Classic Logos Grid",
        defaultProps: {
          title: "Our Brands",
          brands: [],
          grayscaleLogos: true,
        },
        Renderer: BrandShowcaseClassic,
      },
    },
    Editor: BrandShowcaseEditor,
  },
};
```
Finally, make sure to add `"BrandShowcase"` to the `availableSections` list in `registry.tsx` so it populates in the left sidebar Component Library!

---

## 3. Adding a New Design Variant
Variants allow you to change the entire layout or visual design style of an existing block while keeping the underlying data model intact.

To add a new variant (e.g. `slideshow` to `HeroBanner`):
1. **Create the Renderer**: Implement the new design function (e.g., `HeroBannerSlideshow`).
2. **Register the Variant**: Add the renderer to the `variants` object of the existing section definition inside `registry.tsx`:
   ```typescript
   HeroBanner: {
     // ...
     variants: {
       default: { ... },
       split: { ... },
       slideshow: {
         label: "Slideshow / Carousel",
         defaultProps: {
           title: "New Collections Available",
           subtitle: "Check out this season's finest products",
           ctaText: "Explore",
           ctaHref: "/categories",
           autoplay: true,
         },
         Renderer: HeroBannerSlideshow,
       }
     }
   }
   ```
3. The page builder will automatically offer the new variant in the design settings panel. Switching variants loads the respective default properties without discarding other settings!

---

## 4. Guidelines & Rules for Editors
1. **Never use implicit any**: Explicitly type all handler arguments.
2. **Type check with noEmit**: Before shipping, compile both packages using `node node_modules/typescript/bin/tsc --noEmit` to ensure zero TS errors.
3. **Preserve component state**: Avoid using state hook keys that change on variant reload. All persistent settings must reside in section `props` or `styles`.
