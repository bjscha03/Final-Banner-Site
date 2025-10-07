
import React from 'react';
import Layout from '@/components/Layout';
import HeroSection from '@/components/HeroSection';
import CompanySpotlight from '@/components/CompanySpotlight';
import QuickQuote from '@/components/home/QuickQuote';
import TestimonialsSection from '@/components/TestimonialsSection';
import WhyChooseUs from '@/components/WhyChooseUs';
import PromoBanner from '@/components/PromoBanner';
import PricingTable from '@/components/PricingTable';

const Index: React.FC = () => {
  return (
    <Layout>
      <PromoBanner />
      <HeroSection />
      <CompanySpotlight />
      <QuickQuote />
      <TestimonialsSection />
      <WhyChooseUs />
      <PricingTable />
    </Layout>
  );
};

export default Index;
