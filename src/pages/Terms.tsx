import React from 'react';
import Layout from '@/components/Layout';
import { Shield, AlertTriangle, Clock, FileText, Scale, Truck } from 'lucide-react';

const Terms: React.FC = () => {
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 pt-8 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex justify-center mb-4">
              <FileText className="h-8 w-8 text-orange-500" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Terms and Conditions
            </h1>
            <p className="text-xl text-gray-700 max-w-2xl mx-auto">
              BPS Sales Group, Inc. DBA Banners on the Fly
            </p>
          </div>

          {/* Important Notice */}
          <div className="bg-orange-50 border-l-4 border-orange-400 p-6 mb-8 rounded-r-lg">
            <div className="flex items-start">
              <AlertTriangle className="h-6 w-6 text-orange-400 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-orange-800 mb-2">IMPORTANT NOTICE</h2>
                <p className="text-orange-700 leading-relaxed">
                  Please read these terms carefully. By accessing this website and/or placing an order with BPS Sales Group, Inc. DBA Banners on the Fly, you agree to be bound by the terms and conditions below. If you do not agree, do not access this site or place an order.
                </p>
                <p className="text-orange-700 leading-relaxed mt-3">
                  Any modification proposed by the customer is not part of this agreement unless explicitly accepted in writing by BPS Sales Group, Inc. DBA Banners on the Fly. Any conflicting terms on a customer's order form will be considered null and void.
                </p>
                <p className="text-orange-700 leading-relaxed mt-3 font-semibold">
                  BPS Sales Group, Inc. DBA Banners on the Fly reserves the right to modify these terms at any time without notice.
                </p>
              </div>
            </div>
          </div>

          {/* Terms Sections */}
          <div className="space-y-8">
            {/* Limitation of Liability */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Shield className="h-6 w-6 text-red-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Limitation of Liability</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                In no event shall BPS Sales Group, Inc. DBA Banners on the Fly, or its affiliates, suppliers, or employees be liable for any indirect, incidental, special, or consequential damages—including loss of use, data, profits, or business opportunities—arising from use of the website, errors in printed materials, delays in order processing, or any related service.
              </p>
            </section>

            {/* Hours of Operation */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Clock className="h-6 w-6 text-green-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Hours of Operation</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Our website and ordering system are accessible 24/7, allowing customers to place orders at any time.
              </p>
            </section>

            {/* Turnaround Times */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Clock className="h-6 w-6 text-blue-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Turnaround Times</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Most orders placed by midnight will ship the next business day. Custom jobs, large orders, or jobs requiring proofs may require more time. While we strive to meet 24-hour production timelines, delays can occur due to technical or production issues.
              </p>
            </section>

            {/* Warranty / Returns / Refunds */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Shield className="h-6 w-6 text-purple-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Warranty / Returns / Refunds</h2>
              </div>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                <p>
                  BPS Sales Group, Inc. DBA Banners on the Fly warrants that products are free of defects in materials and workmanship. If a product is defective, we will reprint it—no refunds.
                </p>
                <p>
                  All sales are final unless an error is verified on our end. Issues must be reported within 5 business days of receipt, with photos and documentation as required. Damage claims without proof may be denied.
                </p>
              </div>
            </section>

            {/* Customer Content */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <FileText className="h-6 w-6 text-indigo-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Customer Content</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                You are solely responsible for the content you upload. Do not submit any content that is obscene, defamatory, threatening, infringing, or otherwise unlawful. We reserve the right (but not obligation) to remove such content and comply with law enforcement if required.
              </p>
            </section>

            {/* Order Approval */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-6 w-6 text-yellow-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Order Approval</h2>
              </div>
              <div className="space-y-4">
                <p className="text-gray-700 leading-relaxed">
                  Customers are solely responsible for proofreading artwork and content before submission. BPS Sales Group, Inc. DBA Banners on the Fly is not liable for errors related to:
                </p>
                <ul className="grid md:grid-cols-2 gap-2 text-gray-700">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Spelling
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Graphics
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Bleeds
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Fonts
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Crop marks
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Transparency
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Wrong phone number or address
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Any design flaws in the submitted artwork
                  </li>
                </ul>
              </div>
            </section>

            {/* Customer Artwork Requirements */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <FileText className="h-6 w-6 text-teal-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Customer Artwork Requirements</h2>
              </div>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-teal-400 rounded-full mr-3 mt-2"></span>
                  Files must be full-scale, minimum 150 DPI, and in RGB color space
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-teal-400 rounded-full mr-3 mt-2"></span>
                  We are not responsible for quality issues from low-resolution or poorly formatted files
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-teal-400 rounded-full mr-3 mt-2"></span>
                  PMS color matching available only if requested with valid PMS code during order placement
                </li>
              </ul>
            </section>

            {/* Order Cancellation */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Order Cancellation</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Orders may only be canceled if printing has not started. Duplicate orders placed in error are not the responsibility of BPS Sales Group, Inc. DBA Banners on the Fly.
              </p>
            </section>


            {/* Shipping & Delivery */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Truck className="h-6 w-6 text-blue-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Shipping & Delivery</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                We are not liable for shipping delays due to weather, courier issues, customs, or technical problems. Delivery dates are estimates and not guaranteed. We cannot split shipments or use customer-provided courier accounts.
              </p>
            </section>

            {/* Payment & Processing */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Scale className="h-6 w-6 text-green-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Payment & Processing</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Payment is charged at the time of order. Credit card information is not stored. Check or money order payments are accepted but orders will not process until funds clear. Make checks payable to BPS Sales Group, Inc.
              </p>
            </section>

            {/* Governing Law */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Scale className="h-6 w-6 text-purple-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Governing Law</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                All transactions and legal matters shall be governed by the laws of the State of Kentucky. Any legal action must be filed in a court of competent jurisdiction in Jefferson County, KY.
              </p>
            </section>

            {/* Indemnification */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Shield className="h-6 w-6 text-indigo-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Indemnification</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                You agree to indemnify and hold harmless BPS Sales Group, Inc. DBA Banners on the Fly and its licensors from any claims, damages, or legal fees arising from your use of the site, including any content you submit or materials you request us to print.
              </p>
            </section>

            {/* Force Majeure */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-6 w-6 text-gray-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Force Majeure</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                BPS Sales Group, Inc. DBA Banners on the Fly is not responsible for delays caused by Acts of God (e.g., natural disasters, pandemics) or Acts of Society (e.g., terrorism, riots, labor disputes, legislative changes).
              </p>
            </section>

            {/* Shipping Errors & Lost Packages */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Truck className="h-6 w-6 text-red-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Shipping Errors & Lost Packages</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Lost or damaged packages must be reported immediately. We are not responsible for courier errors. If a customer provides an incorrect shipping address, they are responsible for any additional shipping charges incurred.
              </p>
            </section>

            {/* Technical Issues */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-6 w-6 text-yellow-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Technical Issues</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                We are not liable for technical problems beyond our control, including issues with hosting providers, user-side software, or viruses.
              </p>
            </section>

            {/* Refusal of Service */}
            <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Shield className="h-6 w-6 text-gray-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Refusal of Service</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to refuse service to anyone for any lawful reason, at our discretion.
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center">
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <p className="text-gray-600 text-sm">
                Last updated: {new Date().toLocaleDateString()}
              </p>
              <p className="text-gray-600 text-sm mt-2">
                For questions about these terms, please contact us at{' '}
                <a href="mailto:support@bannersonthefly.com" className="text-orange-500 hover:text-blue-800">
                  support@bannersonthefly.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Terms;
