import React from 'react';
import Layout from '@/components/Layout';
import { Truck, Clock, MapPin, Package, DollarSign, AlertTriangle } from 'lucide-react';

const Shipping: React.FC = () => {
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
              Fast, reliable shipping for your custom banners nationwide
            </p>
          </div>

          {/* Quick Overview */}
          <div className="bg-green-50 border-l-4 border-green-400 p-6 mb-8 rounded-r-lg">
            <div className="flex items-start">
              <Package className="h-6 w-6 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-green-800 mb-2">Free Shipping on Orders Over $20</h2>
                <p className="text-green-700 leading-relaxed">
                  Most orders ship the next business day with our 24-hour production guarantee. Orders under $20 include a $5 shipping fee.
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
                      Ground shipping: 3-5 business days
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      Expedited options available at checkout
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                      Delivery dates are estimates, not guarantees
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Shipping Costs */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <DollarSign className="h-6 w-6 text-green-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Shipping Costs</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-900">Order Total</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-900">Shipping Cost</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-900">Delivery Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-200 px-4 py-3 text-gray-700">Under $20</td>
                      <td className="border border-gray-200 px-4 py-3 text-gray-700">$5.00</td>
                      <td className="border border-gray-200 px-4 py-3 text-gray-700">3-5 business days</td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="border border-gray-200 px-4 py-3 text-gray-700 font-semibold">$20 and above</td>
                      <td className="border border-gray-200 px-4 py-3 text-green-700 font-semibold">FREE</td>
                      <td className="border border-gray-200 px-4 py-3 text-gray-700">3-5 business days</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-4 py-3 text-gray-700">Rush Processing</td>
                      <td className="border border-gray-200 px-4 py-3 text-gray-700">Additional fees apply</td>
                      <td className="border border-gray-200 px-4 py-3 text-gray-700">1-2 business days</td>
                    </tr>
                  </tbody>
                </table>
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
                      Alaska and Hawaii (additional fees may apply)
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
                <a href="mailto:shipping@bannersonthefly.com" className="text-blue-600 hover:text-blue-800 text-sm">
                  shipping@bannersonthefly.com
                </a>
                <span className="text-gray-400 hidden sm:block">|</span>
                <span className="text-gray-600 text-sm">24/7 Support Available</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Shipping;
