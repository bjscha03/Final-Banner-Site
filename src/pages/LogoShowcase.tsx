import React from 'react';
import Layout from '@/components/Layout';
import Logo from '@/components/Logo';

const LogoShowcase: React.FC = () => {
  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Banners On The Fly - Logo Showcase
            </h1>
            <p className="text-lg text-gray-600">
              All logo variants and their recommended use cases
            </p>
          </div>

          <div className="space-y-16">
            {/* Hero Logo */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hero Logo</h2>
              <p className="text-gray-600 mb-6">
                Large version with enhanced styling for hero sections and marketing materials
              </p>
              <div className="flex justify-center bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl p-8">
                <Logo variant="hero" />
              </div>
              <div className="mt-4 text-sm text-gray-500">
                Dimensions: 600×180px | Usage: Hero sections, presentations
              </div>
            </div>

            {/* Full Logo */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Full Logo</h2>
              <p className="text-gray-600 mb-6">
                Standard horizontal logo for headers, footers, and business materials
              </p>
              <div className="flex justify-center bg-gray-100 rounded-xl p-8">
                <Logo variant="full" />
              </div>
              <div className="mt-4 text-sm text-gray-500">
                Dimensions: 400×120px | Usage: Headers, footers, business cards
              </div>
            </div>

            {/* Compact Logo */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Compact Logo</h2>
              <p className="text-gray-600 mb-6">
                Smaller version for navigation bars and tight spaces
              </p>
              <div className="flex justify-center bg-gray-100 rounded-xl p-8">
                <Logo variant="compact" />
              </div>
              <div className="mt-4 text-sm text-gray-500">
                Dimensions: 300×90px | Usage: Navigation, mobile headers
              </div>
            </div>

            {/* Icon Logo */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Icon Logo</h2>
              <p className="text-gray-600 mb-6">
                Square icon version for social media, favicons, and app icons
              </p>
              <div className="flex justify-center bg-gray-100 rounded-xl p-8">
                <Logo variant="icon" />
              </div>
              <div className="mt-4 text-sm text-gray-500">
                Dimensions: 120×120px | Usage: Social media, favicons, app icons
              </div>
            </div>

            {/* Usage Guidelines */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Usage Guidelines</h2>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Do's</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Use on clean, uncluttered backgrounds</li>
                    <li>• Maintain proper spacing around the logo</li>
                    <li>• Use the appropriate variant for each context</li>
                    <li>• Ensure good contrast with background</li>
                    <li>• Keep proportions intact when resizing</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Don'ts</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Don't stretch or distort the logo</li>
                    <li>• Don't use on busy or conflicting backgrounds</li>
                    <li>• Don't change colors or add effects</li>
                    <li>• Don't place too close to other elements</li>
                    <li>• Don't use low-resolution versions</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Need Custom Banners?</h2>
              <div className="text-center">
                <p className="text-lg text-gray-600 mb-6">
                  Contact us for custom banner designs and printing services
                </p>
                <div className="space-y-2 text-gray-700">
                  <p>john@bannersonthefly.com</p>
                  <p>(555) 123-4567</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LogoShowcase;
