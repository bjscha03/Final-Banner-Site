import React from 'react';
import Layout from '@/components/Layout';
import { Shield, Eye, Lock, Database, UserCheck, Globe } from 'lucide-react';

const Privacy: React.FC = () => {
  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 pt-8 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent">
                Privacy Policy
              </h1>
            </div>
            <p className="text-xl text-gray-700 max-w-2xl mx-auto">
              BPS Sales Group, Inc. DBA Banners on the Fly
            </p>
            <p className="text-gray-600 mt-2">
              Effective Date: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Introduction */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-6 mb-8 rounded-r-lg">
            <div className="flex items-start">
              <Eye className="h-6 w-6 text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-blue-800 mb-2">Our Commitment to Privacy</h2>
                <p className="text-blue-700 leading-relaxed">
                  At Banners on the Fly, we are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, and safeguard your data when you use our website and services.
                </p>
              </div>
            </div>
          </div>

          {/* Privacy Sections */}
          <div className="space-y-8">
            {/* Information We Collect */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Database className="h-6 w-6 text-green-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Information We Collect</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Personal Information</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Name, email address, phone number
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Billing and shipping addresses
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Payment information (processed securely through third-party providers)
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Information</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Design files and artwork you upload
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Order specifications and preferences
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Communication history related to your orders
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Technical Information</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      IP address, browser type, and device information
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Website usage data and analytics
                    </li>
                    <li className="flex items-start">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3 mt-2"></span>
                      Cookies and similar tracking technologies
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* How We Use Your Information */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <UserCheck className="h-6 w-6 text-blue-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">How We Use Your Information</h2>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                  Process and fulfill your banner orders
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                  Communicate with you about your orders and account
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                  Provide customer support and technical assistance
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                  Improve our website, services, and user experience
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                  Send promotional emails (with your consent)
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 mt-2"></span>
                  Comply with legal obligations and prevent fraud
                </li>
              </ul>
            </section>

            {/* Information Sharing */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Globe className="h-6 w-6 text-purple-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Information Sharing</h2>
              </div>
              <div className="space-y-4 text-gray-700">
                <p className="leading-relaxed">
                  We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                    With service providers who help us operate our business (payment processors, shipping companies)
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                    When required by law or to protect our legal rights
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                    In connection with a business transfer or merger
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2"></span>
                    With your explicit consent
                  </li>
                </ul>
              </div>
            </section>

            {/* Data Security */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Lock className="h-6 w-6 text-red-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Data Security</h2>
              </div>
              <div className="space-y-4 text-gray-700">
                <p className="leading-relaxed">
                  We implement industry-standard security measures to protect your personal information:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-red-400 rounded-full mr-3 mt-2"></span>
                    SSL encryption for all data transmission
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-red-400 rounded-full mr-3 mt-2"></span>
                    Secure payment processing through trusted providers
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-red-400 rounded-full mr-3 mt-2"></span>
                    Regular security audits and updates
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-red-400 rounded-full mr-3 mt-2"></span>
                    Limited access to personal data on a need-to-know basis
                  </li>
                </ul>
              </div>
            </section>

            {/* Your Rights */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <UserCheck className="h-6 w-6 text-indigo-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Your Rights</h2>
              </div>
              <div className="space-y-4 text-gray-700">
                <p className="leading-relaxed">
                  You have the following rights regarding your personal information:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                    Access and review your personal data
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                    Request corrections to inaccurate information
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                    Request deletion of your data (subject to legal requirements)
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                    Opt out of marketing communications
                  </li>
                  <li className="flex items-start">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full mr-3 mt-2"></span>
                    Request data portability
                  </li>
                </ul>
              </div>
            </section>

            {/* Cookies */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Database className="h-6 w-6 text-orange-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Cookies and Tracking</h2>
              </div>
              <div className="space-y-4 text-gray-700">
                <p className="leading-relaxed">
                  We use cookies and similar technologies to enhance your browsing experience and analyze website usage. You can control cookie settings through your browser preferences.
                </p>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-orange-800 text-sm">
                    <strong>Note:</strong> Disabling cookies may affect the functionality of our website and your ability to place orders.
                  </p>
                </div>
              </div>
            </section>

            {/* Contact Information */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center mb-4">
                <Shield className="h-6 w-6 text-green-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">Contact Us</h2>
              </div>
              <div className="space-y-4 text-gray-700">
                <p className="leading-relaxed">
                  If you have questions about this Privacy Policy or wish to exercise your rights, please contact us:
                </p>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p><strong>Email:</strong> <a href="mailto:support@bannersonthefly.com" className="text-blue-600 hover:text-blue-800">support@bannersonthefly.com</a></p>
                  <p><strong>Company:</strong> BPS Sales Group, Inc. DBA Banners on the Fly</p>
                  <p><strong>Response Time:</strong> We will respond to privacy requests within 30 days</p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center">
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <p className="text-gray-600 text-sm">
                This Privacy Policy may be updated from time to time. We will notify you of any significant changes.
              </p>
              <p className="text-gray-600 text-sm mt-2">
                Last updated: {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Privacy;
