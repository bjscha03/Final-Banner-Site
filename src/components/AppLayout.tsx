import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useIsMobile } from '@/hooks/use-mobile';
import Header from './Header';
import HeroSection from './HeroSection';
import QuickQuote from './home/QuickQuote';
import TestimonialsSection from './TestimonialsSection';
import WhyChooseUs from './WhyChooseUs';
import PricingTable from './PricingTable';
import DesignTool from './DesignTool';
import AboutSection from './AboutSection';
import FAQSection from './FAQSection';
import ContactSection from './ContactSection';
import Footer from './Footer';
import CartModal from './CartModal';

interface CartItem {
  id: string;
  name: string;
  size: string;
  material: string;
  quantity: number;
  price: number;
}

const AppLayout: React.FC = () => {
  const { sidebarOpen, toggleSidebar } = useAppContext();
  const isMobile = useIsMobile();
  const [currentSection, setCurrentSection] = useState('home');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Handle navigation based on hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || 'home';
      setCurrentSection(hash);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const updateCartQuantity = (id: string, quantity: number) => {
    setCartItems(items => 
      items.map(item => 
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const removeCartItem = (id: string) => {
    setCartItems(items => items.filter(item => item.id !== id));
  };

  const renderCurrentSection = () => {
    switch (currentSection) {
      case 'design':
        return <DesignTool />;
      case 'about':
        return <AboutSection />;
      case 'faq':
        return <FAQSection />;
      case 'contact':
        return <ContactSection />;
      case 'terms':
        return (
          <section className="py-16 bg-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms & Conditions</h1>
              <div className="prose max-w-none">
                <p className="text-gray-600 mb-6">
                  By using Banners On The Fly services, you agree to these terms and conditions.
                </p>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Terms</h2>
                <p className="text-gray-600 mb-4">
                  All orders are subject to approval and availability. We reserve the right to refuse any order.
                </p>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Quality Guarantee</h2>
                <p className="text-gray-600 mb-4">
                  We guarantee 100% satisfaction with our products. If you're not satisfied, we'll reprint or refund.
                </p>
              </div>
            </div>
          </section>
        );
      default:
        return (
          <>
            <HeroSection />
            <QuickQuote />
            <TestimonialsSection />
            <WhyChooseUs />
            <PricingTable />
          </>
        );
    }
  };

  return (
    <div>
      {renderCurrentSection()}
    </div>
  );
};

export default AppLayout;
