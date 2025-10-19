/**
 * Category Page Template
 * SEO-optimized page for banner product categories
 */

import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import SEO, {
  getBreadcrumbSchema,
  getProductSchema,
  getWebPageSchema,
  getOrganizationSchema,
} from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import PageHeader from '@/components/PageHeader';
import { getCategoryBySlug } from '@/lib/seo/categoryData';
import { Check, ArrowRight, Package, Truck, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CategoryPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  
  if (!slug) {
    return <Navigate to="/" replace />;
  }

  const category = getCategoryBySlug(slug);

  if (!category) {
    return <Navigate to="/" replace />;
  }

  // Generate schema markup
  const schemas = [
    getOrganizationSchema(),
    getBreadcrumbSchema(category.breadcrumbs),
    getProductSchema({
      name: category.schema.name,
      description: category.schema.description,
      image: category.schema.image,
      price: category.schema.offers?.price,
      priceCurrency: category.schema.offers?.priceCurrency,
      availability: category.schema.offers?.availability,
    }),
    getWebPageSchema({
      name: category.title,
      description: category.metaDescription,
      url: category.canonicalUrl,
    }),
  ];

  return (
    <Layout>
      <SEO
        title={category.metaTitle}
        description={category.metaDescription}
        canonical={category.canonicalUrl}
        ogImage={category.ogImage}
        ogType="product"
        keywords={category.keywords}
        schema={schemas}
      />

      <div className="bg-white">
        {/* Page Header */}
        <PageHeader
          title={category.h1}
          subtitle={category.description}
        />

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Breadcrumbs */}
          <Breadcrumbs items={category.breadcrumbs} />

          {/* Trust Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <Clock className="h-8 w-8 text-[#18448D] flex-shrink-0" />
              <div>
                <div className="font-bold text-gray-900">24-Hour</div>
                <div className="text-sm text-gray-600">Production</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <Truck className="h-8 w-8 text-[#18448D] flex-shrink-0" />
              <div>
                <div className="font-bold text-gray-900">Free</div>
                <div className="text-sm text-gray-600">Next-Day Air</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <Shield className="h-8 w-8 text-[#18448D] flex-shrink-0" />
              <div>
                <div className="font-bold text-gray-900">Quality</div>
                <div className="text-sm text-gray-600">Guaranteed</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <Package className="h-8 w-8 text-[#18448D] flex-shrink-0" />
              <div>
                <div className="font-bold text-gray-900">Custom</div>
                <div className="text-sm text-gray-600">Sizes</div>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid md:grid-cols-2 gap-12 mb-12">
            {/* Features */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
                Features & Benefits
              </h2>
              <ul className="space-y-3">
                {category.content.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Common Uses */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
                Perfect For
              </h2>
              <ul className="space-y-3">
                {category.content.uses.map((use, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-[#18448D] flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{use}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Available Sizes */}
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
              Available Sizes
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {category.content.sizes.map((size, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 rounded-lg text-center border-2 border-gray-200 hover:border-[#18448D] transition-colors"
                >
                  <div className="font-semibold text-gray-900">{size}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Materials (if applicable) */}
          {category.content.materials && category.content.materials.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
                Material Options
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {category.content.materials.map((material, index) => (
                  <div
                    key={index}
                    className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-gray-200 hover:border-[#18448D] transition-colors"
                  >
                    <div className="font-bold text-lg text-gray-900">{material}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA Section */}
          <div className="bg-gradient-to-r from-[#18448D] to-[#1a5bb8] rounded-2xl p-8 sm:p-12 text-center text-white mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg sm:text-xl mb-8 text-blue-100">
              Design your custom {category.title.toLowerCase()} online with our easy-to-use tool
            </p>
            <Link to="/design">
              <Button
                size="lg"
                className="bg-[#ff6b35] hover:bg-[#f7931e] text-white font-bold px-8 py-6 text-lg rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                Start Designing Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>

          {/* Related Categories */}
          {category.relatedCategories.length > 0 && (
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 border-b-2 border-gray-200 pb-3">
                Related Products
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {category.relatedCategories.map((relatedSlug) => {
                  const relatedCategory = getCategoryBySlug(relatedSlug);
                  if (!relatedCategory) return null;

                  return (
                    <Link
                      key={relatedSlug}
                      to={`/${relatedSlug}`}
                      className="group p-6 bg-white border-2 border-gray-200 rounded-lg hover:border-[#18448D] hover:shadow-lg transition-all"
                    >
                      <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#18448D] transition-colors">
                        {relatedCategory.title}
                      </h3>
                      <p className="text-gray-600 mb-4 line-clamp-2">
                        {relatedCategory.description}
                      </p>
                      <div className="flex items-center text-[#18448D] font-semibold group-hover:text-[#ff6b35] transition-colors">
                        Learn More
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default CategoryPage;
