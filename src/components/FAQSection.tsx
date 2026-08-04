import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SITE_POLICIES } from '@/lib/sitePolicies';

const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "What file formats do you accept?",
      answer: SITE_POLICIES.artwork.detail
    },
    {
      question: "What is your turnaround time?",
      answer: SITE_POLICIES.production.detail
    },
    {
      question: "What banner sizes do you offer?",
      answer: "The banner configurator accepts dimensions from 6 inches to 600 inches per side, up to 1,000 square feet. Larger work requires a custom quote and may need additional production time."
    },
    {
      question: "What materials do you use?",
      answer: "We offer four premium vinyl materials: 13oz (indoor/short-term outdoor), 15oz (most popular for outdoor use), 18oz (heavy-duty outdoor), and Mesh (wind-resistant for fencing)."
    },
    {
      question: "How do grommets work?",
      answer: "The current banner configurator offers no grommets, every 2–3 feet, every 1–2 feet, four corners only, top corners only, right corners only, or left corners only."
    },
    {
      question: "What is your return policy?",
      answer: SITE_POLICIES.returns.detail
    },
    {
      question: "Do you provide design proofs?",
      answer: SITE_POLICIES.preview.detail
    },
    {
      question: "What shipping options are available?",
      answer: SITE_POLICIES.shipping.detail
    },
    {
      question: "Do you offer bulk discounts?",
      answer: "For banners: Yes, we offer volume discounts for orders of 2+ banners — up to 13% off at checkout. Yard signs use flat per-sign pricing with no quantity discounts."
    }
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <HelpCircle className="h-6 w-6 text-orange-500" />
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <p className="text-lg text-gray-600">
            Everything you need to know about our banner printing services
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden">
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <h3 className="text-lg font-semibold text-gray-900 pr-4">
                  {faq.question}
                </h3>
                {openIndex === index ? (
                  <ChevronUp className="h-5 w-5 text-orange-500 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                )}
              </button>
              
              {openIndex === index && (
                <div className="px-6 pb-4">
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-gray-700 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <div className="bg-blue-50 rounded-xl p-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Still have questions?
            </h3>
            <p className="text-gray-600 mb-6">
              Send us a message if you have a question before placing your order.
            </p>
            <Link to="/contact" className="inline-flex min-h-11 items-center justify-center bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
