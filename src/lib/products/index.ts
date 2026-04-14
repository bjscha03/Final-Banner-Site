/**
 * Products module — public API
 * 
 * Re-exports everything from the registry so consuming code
 * can import from '@/lib/products' instead of '@/lib/products/registry'.
 */
export {
  type ProductTypeSlug,
  type ProductTypeConfig,
  type MaterialConfig,
  type GrommetOption,
  type PolePocketOption,
  type DimensionsConfig,
  type RopeConfig,
  type PolePocketConfig,
  type PrintConfig,
  type EditorConfig,
  type PredefinedSize,
  type MaterialMultiplier,
  getProductConfig,
  isValidProductType,
  getAllProductTypes,
  getMaterialPriceMap,
  getMinimumUnitPriceCents,
  getTaxRate,
  chooseTargetDpi,
  DEFAULT_PRODUCT_TYPE,
} from './registry';
