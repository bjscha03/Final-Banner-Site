import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import HeroSection from '@/components/HeroSection';
import CompanySpotlight from '@/components/CompanySpotlight';
import TestimonialsSection from '@/components/TestimonialsSection';
import WhyChooseUs from '@/components/WhyChooseUs';
import PromoBanner from '@/components/PromoBanner';
import PricingTable from '@/components/PricingTable';
import DeliveryCountdown from '@/components/DeliveryCountdown';

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
          const user = JSON.parse(storedUser);
          console.log('✅ User found in localStorage:', user.email);
          
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
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <DeliveryCountdown />
      </div>
      <PromoBanner />
      <HeroSection />
      <CompanySpotlight />
      <TestimonialsSection />
      <WhyChooseUs />
      <PricingTable />
    </Layout>
  );
};

export default Index;
