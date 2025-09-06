
import React from 'react';
import Layout from '@/components/Layout';
import HeroSection from '@/components/HeroSection';
import QuickQuote from '@/components/home/QuickQuote';
import TestimonialsSection from '@/components/TestimonialsSection';
import WhyChooseUs from '@/components/WhyChooseUs';
import PricingTable from '@/components/PricingTable';

const Index: React.FC = () => {
  return (
    <Layout>
      <HeroSection />
      <QuickQuote />
      <TestimonialsSection />
      <WhyChooseUs />
      <PricingTable />
    </Layout>
  );
};

export default Index;
