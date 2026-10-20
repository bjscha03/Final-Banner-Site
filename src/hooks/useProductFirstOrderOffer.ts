import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { useAutomaticFirstOrderDiscount } from './useAutomaticFirstOrderDiscount';

export function useProductFirstOrderOffer() {
  const { user, loading } = useAuth();
  const eligibility = useAutomaticFirstOrderDiscount({ user, authLoading: loading });
  const discount = useCartStore(state => state.discountCode);
  return { ...eligibility, discount: eligibility.checking ? null : discount,
    showBadge: !eligibility.checking && discount?.code === 'NEW20' };
}
