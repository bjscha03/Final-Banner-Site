import React, { useEffect } from 'react';
import Layout from '@/components/Layout';
import { Truck, Clock, MapPin, Package, DollarSign, AlertTriangle } from 'lucide-react';
import { getFeatureFlags } from '@/lib/pricing';

const Shipping: React.FC = () => {
  // Get feature flags to determine conditional content
  const flags = getFeatureFlags();
  const hasMinOrderFloor = flags.minOrderFloor && flags.minOrderCents >= 2000;

  // Update page metadata
  useEffect(() => {
    document.title = 'Shipping Information | Banners On The Fly';

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', '24-hour production with free next-day air shipping on orders $20+. Orders under $20 ship ground for $5. See production times, coverage, packaging, and tracking.');
    }

    // Cleanup function to restore original title when component unmounts
    return () => {
      document.title = 'Banners On The Fly - Professional Banners • Free Next-Day Air • 24-Hour Production';
    };
  }, []);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 pt-8 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <Truck className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent">
                Shipping Information
              </h1>
            </div>
            <p className="text-xl text-gray-700 max-w-2xl mx-auto">
              24-hour production and fast delivery for your custom banners
            </p>
          </div>

          {/* Top Badge */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white text-sm font-medium rounded-full shadow-lg">
              <Clock className="h-4 w-4 mr-2" />
              {flags.siteBadge || 'FREE Next-Day Air • 24-Hour Production'}
            </div>
          </div>

          {/* Hero Callout Section */}
          <div className="bg-green-50 border-l-4 border-green-400 p-6 mb-8 rounded-r-lg">
            <div className="flex items-start">
              <Package className="h-6 w-6 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-green-800 mb-2">
                  🎉 FREE Next-Day Air Shipping on ALL Orders!
                </h2>
                <p className="text-green-700 leading-relaxed">
                  Every order ships completely FREE via next-day air with our 24-hour production guarantee. No minimum order required, no hidden fees, no exceptions!
                </p>
              </div>
            </div>
          </div>

          {/* Shipping Sections */}
          <div className="space-y-8">
            {/* Production & Shipping Times */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Clock className="h-6 w-6 text-blue-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Production & Shipping Times</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Standard Production</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      Orders placed by midnight ship next business day
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      24-hour production guarantee for most orders
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      Custom jobs may require additional time
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Delivery Times</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      {flags.shippingMethodLabel || 'Free Next-Day Air'}: 1 business day
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      Saturday delivery available in select areas
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      Delivery dates are estimates, not guarantees
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Free Shipping */}
            <section className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl shadow-lg p-8 border-2 border-green-200">
              <div className="flex items-center mb-4">
                <DollarSign className="h-6 w-6 text-green-600 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">🎉 FREE Shipping on ALL Orders!</h2>
              </div>

              {/* Prominent Free Shipping Message */}
              <div className="bg-white rounded-lg p-6 mb-6 border-2 border-green-300 shadow-sm">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">$0.00 SHIPPING</div>
                  <div className="text-lg text-gray-800 mb-3">
                    <strong>Every order ships completely FREE!</strong>
                  </div>
                  <div className="text-gray-700">
                    No minimum order required • No hidden fees • No exceptions
                  </div>
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-green-50">
                      <th className="border border-green-200 px-4 py-3 text-left font-semibold text-gray-900">Order Size</th>
                      <th className="border border-green-200 px-4 py-3 text-left font-semibold text-gray-900">Shipping Cost</th>
                      <th className="border border-green-200 px-4 py-3 text-left font-semibold text-gray-900">Delivery Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-green-50">
                      <td className="border border-green-200 px-4 py-3 text-gray-800 font-medium">Any Order Amount</td>
                      <td className="border border-green-200 px-4 py-3 text-green-700 font-bold text-lg">FREE</td>
                      <td className="border border-green-200 px-4 py-3 text-gray-700">1 business day (next-day air)</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="border border-blue-200 px-4 py-3 text-gray-700">Same-Day Processing</td>
                      <td className="border border-blue-200 px-4 py-3 text-green-700 font-bold">FREE</td>
                      <td className="border border-blue-200 px-4 py-3 text-gray-700">Same day + next-day air</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                <div className="bg-green-50 rounded-lg p-4 border-2 border-green-300">
                  <div className="font-bold text-gray-900 mb-2 text-lg">Any Order Amount</div>
                  <div className="text-sm text-gray-700">
                    <div className="flex justify-between mb-1">
                      <span>Shipping Cost:</span>
                      <span className="text-green-700 font-bold text-lg">FREE</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Time:</span>
                      <span>1 business day (next-day air)</span>
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-300">
                  <div className="font-semibold text-gray-900 mb-2">Same-Day Processing</div>
                  <div className="text-sm text-gray-700">
                    <div className="flex justify-between mb-1">
                      <span>Shipping Cost:</span>
                      <span className="text-green-700 font-bold">FREE</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Time:</span>
                      <span>Same day + next-day air</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Free Shipping Guarantee */}
              <div className="mt-4 p-4 bg-green-100 border-2 border-green-300 rounded-lg">
                <p className="text-green-800 text-sm font-medium text-center">
                  ✅ <strong>100% FREE SHIPPING GUARANTEE:</strong> No minimum order • No hidden fees • No exceptions
                </p>
              </div>
            </section>

            {/* Shipping Coverage */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <MapPin className="h-6 w-6 text-purple-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Shipping Coverage</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Domestic Shipping</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                      All 50 United States
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                      Alaska and Hawaii (FREE shipping included)
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                      PO Boxes and military addresses accepted
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">International Shipping</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                      Currently not available
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                      Contact us for special arrangements
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                      Future expansion planned
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Packaging */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Package className="h-6 w-6 text-orange-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Packaging & Protection</h2>
              </div>
              <div className="space-y-4 text-gray-700">
                <p className="leading-relaxed">
                  Your banners are carefully packaged to ensure they arrive in perfect condition:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-orange-400 rounded-full mr-3 mt-2"></span>
                    Rolled in protective tubes for larger banners
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-orange-400 rounded-full mr-3 mt-2"></span>
                    Flat packaging for smaller items
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-orange-400 rounded-full mr-3 mt-2"></span>
                    Moisture-resistant materials
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-orange-400 rounded-full mr-3 mt-2"></span>
                    Clearly labeled with handling instructions
                  </li>
                </ul>
              </div>
            </section>

            {/* Tracking & Delivery */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Truck className="h-6 w-6 text-indigo-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Tracking & Delivery</h2>
              </div>
              <div className="space-y-4 text-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Tracking</h3>
                  <ul className="space-y-2">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                      Tracking number provided via email when shipped
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                      Real-time updates through carrier website
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                      SMS notifications available (carrier dependent)
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Delivery Options</h3>
                  <ul className="space-y-2">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                      Standard delivery to your address
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                      Signature required for high-value orders
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                      Hold at carrier location available
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Important Notes */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Important Shipping Notes</h2>
              </div>
              <div className="space-y-4">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-yellow-800 mb-2">Address Accuracy</h3>
                  <p className="text-yellow-700 text-sm">
                    Please ensure your shipping address is correct. We are not responsible for additional charges due to incorrect addresses provided by customers.
                  </p>
                </div>
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-red-800 mb-2">Weather & Carrier Delays</h3>
                  <p className="text-red-700 text-sm">
                    We are not liable for shipping delays due to weather conditions, carrier issues, or other circumstances beyond our control.
                  </p>
                </div>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-blue-800 mb-2">Lost or Damaged Packages</h3>
                  <p className="text-blue-700 text-sm">
                    Report lost or damaged packages immediately. We will work with the carrier to resolve issues and may reprint your order if necessary.
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Contact Information */}
          <div className="mt-12 text-center">
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Questions About Shipping?</h3>
              <p className="text-gray-600 text-sm mb-4">
                Our customer service team is here to help with any shipping questions or concerns.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-6">
                <a href="mailto:support@bannersonthefly.com" className="text-blue-600 hover:text-blue-800 text-sm">
                  support@bannersonthefly.com
                </a>
                <span className="text-gray-400 hidden sm:block">|</span>
                <span className="text-gray-600 text-sm">24/7 Support Available</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* JSON-LD Schema for FAQ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "How fast do orders ship?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Most orders placed by midnight ship the next business day (24-hour production guarantee)."
                }
              },
              {
                "@type": "Question",
                "name": "How much is shipping?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Shipping is completely FREE on all orders with no minimum required. Every order ships via next-day air at no cost to you."
                }
              },
              {
                "@type": "Question",
                "name": "Do you ship to Alaska/Hawaii?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes; additional fees may apply."
                }
              },
              {
                "@type": "Question",
                "name": "Do you offer international shipping?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Not currently; contact us for special arrangements."
                }
              }
            ]
          })
        }}
      />
    </Layout>
  );
};

export default Shipping;
