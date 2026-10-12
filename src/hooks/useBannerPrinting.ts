import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MaterialKey } from '@/store/quote';

/** Printing is encoded in the existing material SKU, keeping every price and
 * print-file path on the same source of truth. Artwork state is independent. */
export function useBannerPrinting() {
  const [params, setParams] = useSearchParams();
  const [material, setMaterialState] = useState<MaterialKey>(() => params.get('sides') === 'double' ? '18oz_double' : '13oz');
  const lastSingleMaterial = useRef<MaterialKey>('13oz');
  const sides = params.get('sides');
  const editItem = params.get('editItem');

  useEffect(() => {
    // Cart restoration is authoritative, even for old links without ?sides.
    if (!editItem) setMaterialState(sides === 'double' ? '18oz_double' : lastSingleMaterial.current);
  }, [sides, editItem]);

  const setMaterial = useCallback((value: MaterialKey) => {
    if (value !== '18oz_double') lastSingleMaterial.current = value;
    setMaterialState(value);
  }, []);

  const setDoubleSided = (doubleSided: boolean) => {
    setMaterialState(doubleSided ? '18oz_double' : lastSingleMaterial.current);
    const next = new URLSearchParams(params);
    if (doubleSided) next.set('sides', 'double');
    else next.delete('sides');
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return { material, setMaterial, setDoubleSided };
}
