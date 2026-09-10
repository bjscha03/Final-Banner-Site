import { getProductConfig, type ProductTypeSlug } from './registry';

export type ProductConfigurationValidation = {
  valid: boolean;
  code?: 'INVALID_DIMENSIONS' | 'DIMENSIONS_OUT_OF_RANGE' | 'AREA_LIMIT_EXCEEDED' | 'INVALID_GROMMETS';
  message?: string;
};

export const validateProductConfiguration = ({
  productType,
  widthIn,
  heightIn,
  grommets,
}: {
  productType: ProductTypeSlug;
  widthIn: number;
  heightIn: number;
  grommets?: string | null;
}): ProductConfigurationValidation => {
  const config = getProductConfig(productType);
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    return { valid: false, code: 'INVALID_DIMENSIONS', message: 'Enter a valid width and height before continuing.' };
  }

  if (widthIn < config.dimensions.minIn || heightIn < config.dimensions.minIn
    || widthIn > config.dimensions.maxIn || heightIn > config.dimensions.maxIn) {
    return {
      valid: false,
      code: 'DIMENSIONS_OUT_OF_RANGE',
      message: `${config.name} dimensions must be between ${config.dimensions.minIn} and ${config.dimensions.maxIn} inches.`,
    };
  }

  const areaSqFt = (widthIn * heightIn) / 144;
  if (areaSqFt > config.dimensions.maxSqFt) {
    return { valid: false, code: 'AREA_LIMIT_EXCEEDED', message: config.dimensions.sizeLimitMessage };
  }

  if (productType === 'banner' && grommets) {
    const supported = config.grommets.some((option) => option.value === grommets);
    if (!supported) {
      return { valid: false, code: 'INVALID_GROMMETS', message: 'Choose a supported grommet placement before continuing.' };
    }
  }

  return { valid: true };
};
