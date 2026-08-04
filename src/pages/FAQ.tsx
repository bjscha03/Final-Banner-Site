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
    <Layout showFooterBanner={false}>
      <PageHeader
        title="Frequently Asked Questions"
        subtitle="Search current answers about products, materials, artwork, pricing, production, shipping, changes, and order support."
        centered={false}
      />
      
      <div className="brand-section min-h-screen bg-white">
        <div className="brand-shell max-w-5xl">

          {/* Search Bar */}
          <div className="mb-7">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search questions and answers"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="brand-field pl-10"
              />
            </div>
          </div>

          <div className="mb-8 flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-200">
            <button
              onClick={() => setSearchTerm('')}
              className={`border-b-2 px-1 py-3 text-sm font-bold transition-colors ${
                searchTerm === '' 
                  ? 'border-[#FF6A00] text-[#0B1F3A]'
                  : 'border-transparent text-slate-500 hover:text-[#0B1F3A]'
              }`}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSearchTerm(category)}
                className={`border-b-2 px-1 py-3 text-sm font-bold transition-colors ${
                  searchTerm.toLowerCase() === category.toLowerCase()
                    ? 'border-[#FF6A00] text-[#0B1F3A]'
                    : 'border-transparent text-slate-500 hover:text-[#0B1F3A]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* FAQ Items */}
          <div className="border-t border-slate-200">
            {filteredFAQs.length > 0 ? (
              filteredFAQs.map((faq, index) => (
                <div
                  key={index}
                  className="border-b border-slate-200 bg-white"
                >
                  <button
                    onClick={() => toggleFAQ(index)}
                    className="flex w-full items-center justify-between gap-5 py-5 text-left transition-colors hover:text-[#D95700] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
                  >
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#D95700]">
                        {faq.category}
                      </span>
                      <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
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
                    <div className="pb-5">
                      <div className="max-w-3xl border-l-2 border-[#FF6A00] pl-5">
                        <p className="whitespace-pre-line leading-7 text-slate-600">
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
          <div className="mt-14 border-l-4 border-[#FF6A00] bg-[#0B1F3A] p-7 text-white sm:p-9">
              <h3 className="font-display text-2xl font-bold">
                Still have questions?
              </h3>
              <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                Our support team is here to help with any questions not covered in our FAQ.
              </p>
              <div className="mt-6">
                <a
                  href="/contact"
                  className="brand-button-primary"
                >
                  Contact Support
                </a>
              </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default FAQ;
