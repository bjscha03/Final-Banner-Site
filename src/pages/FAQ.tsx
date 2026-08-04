import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Search } from 'lucide-react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { SITE_POLICIES } from '@/lib/sitePolicies';

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchTerm, setSearchTerm] = useState('');

  const faqs = [
    {
      question: "What file formats do you accept?",
      answer: SITE_POLICIES.artwork.detail,
      category: "Design"
    },
    {
      question: "What is your turnaround time?",
      answer: SITE_POLICIES.production.detail,
      category: "Production"
    },
    {
      question: "What banner sizes do you offer?",
      answer: "The banner configurator accepts dimensions from 6 inches to 600 inches per side, up to 1,000 square feet. Larger work requires a custom quote and may need additional production time.",
      category: "Specifications"
    },
    {
      question: "What materials do you use?",
      answer: "We offer four premium vinyl materials: 13oz (indoor/short-term outdoor), 15oz (most popular for outdoor use), 18oz (heavy-duty outdoor), and Mesh (wind-resistant for fencing).",
      category: "Materials"
    },
    {
      question: "How do grommets work?",
      answer: "The current banner configurator offers no grommets, every 2–3 feet, every 1–2 feet, four corners only, top corners only, right corners only, or left corners only. The selected option appears in the order summary.",
      category: "Specifications"
    },
    {
      question: "What is your return policy?",
      answer: SITE_POLICIES.returns.detail,
      category: "Policy"
    },
    {
      question: "Do you provide design proofs?",
      answer: SITE_POLICIES.preview.detail,
      category: "Design"
    },
    {
      question: "Do you offer bulk discounts?",
      answer: "For banners — yes, we offer automatic volume discounts based on quantity:\n\n• 2 banners: 5% off\n• 3 banners: 7% off\n• 4 banners: 10% off\n• 5+ banners: 13% off\n\nDiscounts are applied automatically when you increase quantity. No codes needed — savings are built directly into the pricing.\n\nYard signs use flat per-sign pricing with no quantity discounts.",
      category: "Pricing"
    },
    {
      question: "How do I track my order?",
      answer: "Once your order ships, you'll receive a tracking number. You can check your order status anytime by logging into your account and visiting the 'My Orders' page.",
      category: "Orders"
    },
    {
      question: "What shipping options are available?",
      answer: SITE_POLICIES.shipping.detail,
      category: "Shipping"
    },
    {
      question: "What if I order more than 1,000 square feet?",
      answer: "For quantities greater than 1,000 sq ft, production time of 1–5 business days may be required. Ground or freight shipping may apply. Orders over 1,000 sq ft require a custom quote. Please contact us before placing your order.",
      category: "Production"
    },
    {
      question: "Can I cancel or modify my order?",
      answer: SITE_POLICIES.cancellations.detail,
      category: "Orders"
    },
    {
      question: "Do you offer installation services?",
      answer: "We do not offer installation services. Choose attachment options for the intended mounting method, distribute wind load across enough attachment points, and use hardware appropriate for the surface and local conditions.",
      category: "Installation"
    }
  ];

  const filteredFAQs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const categories = [...new Set(faqs.map(faq => faq.category))];

  return (
    <Layout>
      <PageHeader
        title="Frequently Asked Questions"
        subtitle="Find answers to common questions about our banner printing services, materials, and ordering process."
        icon={HelpCircle}
      />
      
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Search Bar */}
          <div className="mb-8">
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search FAQs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <button
              onClick={() => setSearchTerm('')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                searchTerm === '' 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSearchTerm(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  searchTerm.toLowerCase() === category.toLowerCase()
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* FAQ Items */}
          <div className="space-y-4">
            {filteredFAQs.length > 0 ? (
              filteredFAQs.map((faq, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
                >
                  <button
                    onClick={() => toggleFAQ(index)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-medium text-orange-500 bg-slate-100 px-2 py-1 rounded">
                        {faq.category}
                      </span>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {faq.question}
                      </h3>
                    </div>
                    {openIndex === index ? (
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                  </button>
                  
                  {openIndex === index && (
                    <div className="px-6 pb-4">
                      <div className="border-t border-gray-200 pt-4">
                        <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <HelpCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No FAQs found</h3>
                <p className="text-gray-600">
                  Try adjusting your search terms or browse all categories.
                </p>
              </div>
            )}
          </div>

          {/* Contact CTA */}
          <div className="mt-16 text-center">
            <div className="bg-slate-50 rounded-xl p-8 border border-slate-200">
              <h3 className="text-xl font-semibold text-blue-900 mb-4">
                Still have questions?
              </h3>
              <p className="text-[#18448D] mb-6">
                Our support team is here to help with any questions not covered in our FAQ.
              </p>
              <div className="flex justify-center">
                <a
                  href="/contact"
                  className="bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-[#18448D] transition-colors"
                >
                  Contact Support
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default FAQ;
