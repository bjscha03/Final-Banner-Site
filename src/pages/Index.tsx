import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import HeroSection from '@/components/HeroSection';
import CompanySpotlight from '@/components/CompanySpotlight';
import WhyChooseUs from '@/components/WhyChooseUs';
import PromoBanner from '@/components/PromoBanner';
import PricingTable from '@/components/PricingTable';
import DeliveryCarousel from '@/components/home/DeliveryCarousel';
import ProductSelectionStrip from '@/components/home/ProductSelectionStrip';
import CustomQuoteSection from '@/components/home/CustomQuoteSection';
import SeasonalMerchandising from '@/components/seasonal/SeasonalMerchandising';
import SEO from '@/components/SEO';

const Index: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const oauthSuccess = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    
    if (oauthSuccess === 'success' && provider) {
      console.log(`✅ OAuth success detected for ${provider}`);
      
      setTimeout(() => {
        const storedUser = localStorage.getItem('banners_current_user');
        
        if (storedUser) {
          let user: { email?: string } | null = null;
          try {
            const parsed = JSON.parse(storedUser);
            // Ensure the parsed value is a plain object with at least an email
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              user = parsed as { email?: string };
            } else {
              localStorage.removeItem('banners_current_user');
            }
          } catch {
            // Malformed JSON in localStorage – clear it and bail out
            localStorage.removeItem('banners_current_user');
          }
          if (!user) return;
          
          toast({
            title: "Welcome!",
            description: `Successfully signed in with ${provider === 'google' ? 'Google' : 'LinkedIn'}`,
          });
          
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
      <SEO
        title="Custom Banners, Yard Signs & Car Magnets | Banners On The Fly"
        description="Configure custom banners, yard signs, and car magnets online. Most standard orders are produced within 24 hours; free next-day air follows production."
        canonical="https://bannersonthefly.com/"
      />
      <PromoBanner />
      <HeroSection />
      <SeasonalMerchandising />
      <ProductSelectionStrip />
      <WhyChooseUs />
      <PricingTable />
      <CompanySpotlight />
      <DeliveryCarousel />
      <CustomQuoteSection />
    </Layout>
  );
};

export default Index;
