import type { MaterialKey } from '@/store/quote';

/**
 * Single source of truth for the banner material picker UI used by:
 *   - /design (Design.tsx)
 *   - /google-ads-banner (GoogleAdsBanner.tsx)
 *   - /graduation-signs designer-assisted intake (GraduationSigns.tsx)
 *
 * `mapped` is the pricing-engine MaterialKey from `@/store/quote`.
 * `image` is the thumbnail rendered next to the material name.
 */
export interface BannerMaterialOption {
  key: string;
  label: string;
  mapped: MaterialKey;
  desc: string;
  image: string;
}

export const BANNER_MATERIALS: BannerMaterialOption[] = [
  {
    key: '13oz',
    label: '13oz Vinyl',
    mapped: '13oz',
    desc: 'Standard outdoor — great for most uses',
    image:
      'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png',
  },
  {
    key: '15oz',
    label: '15oz Vinyl',
    mapped: '15oz',
    desc: 'Heavy-duty — extra durability and rigidity',
    image:
      'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png',
  },
  {
    key: '18oz',
    label: '18oz Vinyl',
    mapped: '18oz',
    desc: 'Premium blockout — thick, wind-resistant',
    image:
      'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209691/White-label_Outdoor_Banner_3_Product_from_4over_vfdbxc.png',
  },
  {
    key: 'mesh',
    label: 'Mesh Fence',
    mapped: 'mesh',
    desc: 'Wind pass-through — ideal for fences',
    image:
      'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209380/White-label_Outdoor_Mesh_Banner_1_Product_from_4over_ivkbqu.png',
  },
];

export function getBannerMaterialByKey(mapped: MaterialKey | string): BannerMaterialOption {
  return BANNER_MATERIALS.find((m) => m.mapped === mapped) || BANNER_MATERIALS[0];
}
