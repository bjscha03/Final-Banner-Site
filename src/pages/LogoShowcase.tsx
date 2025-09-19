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
              Smaller version for navigation bars and mobile interfaces
            </p>
            <div className="flex justify-center bg-gray-100 rounded-xl p-8">
              <Logo variant="compact" />
            </div>
            <div className="mt-4 text-sm text-gray-500">
              Dimensions: 200×60px | Usage: Navigation bars, mobile headers
            </div>
          </div>

          {/* Icon Logo */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Icon Logo</h2>
            <p className="text-gray-600 mb-6">
              Square icon version for favicons and profile pictures
            </p>
            <div className="flex justify-center bg-gray-100 rounded-xl p-8">
              <Logo variant="icon" />
            </div>
            <div className="mt-4 text-sm text-gray-500">
              Dimensions: 60×60px | Usage: Favicons, app icons, social profiles
            </div>
          </div>

          {/* Different Backgrounds */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Background Variations</h2>
            <p className="text-gray-600 mb-6">
              How the compact logo looks on different backgrounds
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Light Background */}
              <div className="text-center">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-2">
                  <Logo variant="compact" height={40} />
                </div>
                <span className="text-sm text-gray-500">Light Background</span>
              </div>
              
              {/* Dark Background */}
              <div className="text-center">
                <div className="bg-gray-900 rounded-xl p-6 mb-2">
                  <Logo variant="compact" height={40} />
                </div>
                <span className="text-sm text-gray-500">Dark Background</span>
              </div>
              
              {/* Colored Background */}
              <div className="text-center">
                <div className="bg-blue-600 rounded-xl p-6 mb-2">
                  <Logo variant="compact" height={40} />
                </div>
                <span className="text-sm text-gray-500">Colored Background</span>
              </div>
            </div>
          </div>

          {/* Usage Examples */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Usage Examples</h2>
            <p className="text-gray-600 mb-6">
              How the logos appear in real-world contexts
            </p>
            
            {/* Header Example */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Header Navigation</h3>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <Logo variant="compact" height={32} />
                  <div className="flex space-x-6">
                    <span className="text-gray-600">Home</span>
                    <span className="text-gray-600">Design</span>
                    <span className="text-gray-600">About</span>
                    <span className="text-gray-600">Contact</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Business Card Example */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Business Card</h3>
              <div className="bg-white border border-gray-300 rounded-lg p-6 max-w-md">
                <Logo variant="compact" height={24} className="mb-4" />
                <div className="text-sm text-gray-600">
                  <p className="font-semibold">John Smith</p>
                  <p>Sales Manager</p>
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
