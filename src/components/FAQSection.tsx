import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "What file formats do you accept?",
      answer: "We accept PDF, JPG, PNG, and AI files up to 100MB. For best results, we recommend high-resolution PDF files with embedded fonts and images at 300 DPI."
    },
    {
      question: "What is your turnaround time?",
      answer: "We guarantee 24-hour production on all standard orders. Orders placed before 2 PM EST are typically printed and shipped the same day. Rush orders can be accommodated for an additional fee."
    },
    {
      question: "What banner sizes do you offer?",
      answer: "We can print banners in virtually any size from 1' x 1' up to 16' x 50'. Common sizes include 2'x4', 3'x6', 4'x8', and 6'x10'. Custom sizes are available at no extra charge."
    },
    {
      question: "What materials do you use?",
      answer: "We offer four premium vinyl materials: 13oz (indoor/short-term outdoor), 15oz (most popular for outdoor use), 18oz (heavy-duty outdoor), and Mesh (wind-resistant for fencing)."
    },
    {
      question: "How do grommets work?",
      answer: "Grommets are metal-reinforced holes that make hanging easy and prevent tearing. We offer grommets in corners only, every 2 feet, or every 18 inches along the perimeter."
    },
    {
      question: "What is your return policy?",
      answer: "Because every banner is made to order, we don't accept returns. If your order arrives damaged or defective, contact us within 7 days and we'll remake it or refund you."
    },
    {
      question: "Do you provide design proofs?",
      answer: "Yes! We provide digital proofs for all custom designs at no extra charge. You'll receive a proof within 2 hours of placing your order for approval before printing begins."
    },
    {
      question: "Do you offer bulk discounts?",
      answer: "Yes, we offer volume discounts for orders of 10+ banners. Contact our sales team for custom pricing on large orders or recurring business partnerships."
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
              Our customer support team is available 24/7 to help with any questions about your banner order.
            </p>
            <button className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;