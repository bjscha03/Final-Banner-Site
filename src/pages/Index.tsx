
import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import HeroSection from '@/components/HeroSection';
import CompanySpotlight from '@/components/CompanySpotlight';
import QuickQuote from '@/components/home/QuickQuote';
import TestimonialsSection from '@/components/TestimonialsSection';
import WhyChooseUs from '@/components/WhyChooseUs';
import PromoBanner from '@/components/PromoBanner';
import PricingTable from '@/components/PricingTable';
import { useCartStore } from '@/store/cart';

const Index: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    // Handle OAuth success callback
    const oauthSuccess = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    
    if (oauthSuccess === 'success' && provider) {
      console.log(`✅ OAuth success detected for ${provider}`);
      
      console.log('🔥 OAUTH SUCCESS - Clearing cart store IMMEDIATELY');
      // CRITICAL: Clear the Zustand cart store IMMEDIATELY to prevent showing old user's items
      useCartStore.getState().clearCartLocal();
      console.log('✅ Cart store cleared for OAuth login');
      
      // Give extra time for localStorage to be read by auth system
      setTimeout(() => {
        // Check if user is in localStorage
        const storedUser = localStorage.getItem('banners_current_user');
        
        if (storedUser) {
          const user = JSON.parse(storedUser);
          console.log('✅ User found in localStorage:', user.email);
          
          // Show success message
          toast({
            title: "Welcome!",
            description: `Successfully signed in with ${provider === 'google' ? 'Google' : 'LinkedIn'}`,
          });
          
          // Clean up URL parameters
          searchParams.delete('oauth');
          searchParams.delete('provider');
          setSearchParams(searchParams, { replace: true });
        } else {
          console.error('❌ OAuth success but no user in localStorage');
          toast({
            title: "Sign-in Issue",
            description: "Please try signing in again.",
            variant: "destructive",
          });
        }
      }, 100);
    }
  }, [searchParams, setSearchParams, toast]);

  return (
    <Layout>
      <PromoBanner />
      <HeroSection />
      <CompanySpotlight />
      <div id="quick-quote">
        <QuickQuote />
      </div>
      <TestimonialsSection />
      <WhyChooseUs />
      <PricingTable />
    </Layout>
  );
};

export default Index;
