import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Search } from 'lucide-react';
import Layout from '@/components/Layout';

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchTerm, setSearchTerm] = useState('');

  const faqs = [
    {
      question: "What file formats do you accept?",
      answer: "We accept PDF, JPG, PNG, and AI files up to 100MB. For best results, we recommend high-resolution PDF files with embedded fonts and images at 300 DPI.",
      category: "Design"
    },
    {
      question: "What is your turnaround time?",
      answer: "We guarantee 24-hour production on all standard orders. Orders placed before 2 PM EST are typically printed and shipped the same day. Rush orders can be accommodated for an additional fee.",
      category: "Production"
    },
    {
      question: "What banner sizes do you offer?",
      answer: "We can print banners in virtually any size from 1' x 1' up to 16' x 50'. Common sizes include 2'x4', 3'x6', 4'x8', and 6'x10'. Custom sizes are available at no extra charge.",
      category: "Specifications"
    },
    {
      question: "What materials do you use?",
      answer: "We offer four premium vinyl materials: 13oz (indoor/short-term outdoor), 15oz (most popular for outdoor use), 18oz (heavy-duty outdoor), and Mesh (wind-resistant for fencing).",
      category: "Materials"
    },
    {
      question: "How do grommets work?",
      answer: "Grommets are metal-reinforced holes that make hanging easy and prevent tearing. We offer grommets in corners only, every 2 feet, or every 18 inches along the perimeter.",
      category: "Specifications"
    },
    {
      question: "What is your return policy?",
      answer: "We offer a 100% satisfaction guarantee. If you're not completely satisfied with your banner, we'll reprint it free of charge or provide a full refund within 30 days of delivery.",
      category: "Policy"
    },
    {
      question: "Do you provide design proofs?",
      answer: "Yes! We provide digital proofs for all custom designs at no extra charge. You'll receive a proof within 2 hours of placing your order for approval before printing begins.",
      category: "Design"
    },
    {
      question: "Do you offer bulk discounts?",
      answer: "Yes, we offer volume discounts for orders of 10+ banners. Contact our sales team for custom pricing on large orders or recurring business partnerships.",
      category: "Pricing"
    },
    {
      question: "How do I track my order?",
      answer: "Once your order ships, you'll receive a tracking number via email. You can also check your order status anytime by logging into your account and visiting the 'My Orders' page.",
      category: "Orders"
    },
    {
      question: "What shipping options are available?",
      answer: "We offer standard ground shipping (3-5 business days), expedited shipping (2-3 business days), and overnight shipping. All orders over $100 qualify for free standard shipping.",
      category: "Shipping"
    },
    {
      question: "Can I cancel or modify my order?",
      answer: "Orders can be cancelled or modified within 1 hour of placement. After that, orders enter production and cannot be changed. Contact support immediately if you need to make changes.",
      category: "Orders"
    },
    {
      question: "Do you offer installation services?",
      answer: "While we don't provide installation services directly, we can recommend trusted installation partners in your area. We also provide detailed hanging instructions with every order.",
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
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <HelpCircle className="h-8 w-8 text-blue-600" />
              <h1 className="text-4xl font-bold text-gray-900">
                Frequently Asked Questions
              </h1>
            </div>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Find answers to common questions about our banner printing services, materials, and ordering process.
            </p>
          </div>

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
                  ? 'bg-blue-600 text-white' 
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
                    ? 'bg-blue-600 text-white'
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
                      <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
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
                        <p className="text-gray-700 leading-relaxed">
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
            <div className="bg-blue-50 rounded-xl p-8 border border-blue-200">
              <h3 className="text-xl font-semibold text-blue-900 mb-4">
                Still have questions?
              </h3>
              <p className="text-blue-700 mb-6">
                Our support team is here to help with any questions not covered in our FAQ.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="/contact"
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Contact Support
                </a>
                <button className="bg-white text-blue-600 border border-blue-600 px-6 py-3 rounded-lg font-medium hover:bg-blue-50 transition-colors">
                  Start Live Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default FAQ;
