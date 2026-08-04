import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { ArrowRight, Check, Clock, Eye, Package, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO, { getBreadcrumbSchema, getProductSchema, getWebPageSchema, getOrganizationSchema } from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import PageHeader from '@/components/PageHeader';
import { getCategoryBySlug } from '@/lib/seo/categoryData';

const CategoryPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/" replace />;
  const category = getCategoryBySlug(slug);
  if (!category) return <Navigate to="/" replace />;

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
    getWebPageSchema({ name: category.title, description: category.metaDescription, url: category.canonicalUrl }),
  ];

  const facts = [
    { icon: Clock, title: 'Standard production', detail: 'Most orders: 24 hours' },
    { icon: Truck, title: 'Carrier transit', detail: 'Free next-day air' },
    { icon: Eye, title: 'Artwork review', detail: 'Live print preview' },
    { icon: Package, title: 'Online ordering', detail: 'Current options shown' },
  ];

  return (
    <Layout showFooterBanner={false}>
      <SEO
        title={category.metaTitle}
        description={category.metaDescription}
        canonical={category.canonicalUrl}
        ogImage={category.ogImage}
        ogType="product"
        schema={schemas}
      />
      <PageHeader title={category.h1} subtitle={category.description} centered={false} />

      <div className="brand-shell py-3"><Breadcrumbs items={category.breadcrumbs} /></div>

      <section className="border-y border-slate-200 bg-[#F7F7F7]">
        <div className="brand-shell grid sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact, index) => {
            const Icon = fact.icon;
            return (
              <div key={fact.title} className={`flex gap-3 py-5 sm:px-5 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`}>
                <Icon className="mt-0.5 h-5 w-5 flex-none text-[#FF6A00]" aria-hidden="true" />
                <div><p className="font-display text-sm font-bold text-[#0B1F3A]">{fact.title}</p><p className="mt-1 text-xs text-slate-500">{fact.detail}</p></div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="brand-shell">
        <section className="grid gap-10 py-14 lg:grid-cols-2 lg:gap-16">
          {[
            ['Features & benefits', category.content.features],
            ['Common uses', category.content.uses],
          ].map(([title, items]) => (
            <div key={title as string} className="border-t-4 border-[#FF6A00] pt-6">
              <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">{title as string}</h2>
              <ul className="mt-5 space-y-3">
                {(items as string[]).map((item) => (
                  <li key={item} className="flex gap-3 leading-7 text-slate-600"><Check className="mt-1 h-5 w-5 flex-none text-[#0B1F3A]" aria-hidden="true" />{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="border-y border-slate-200 py-12" aria-labelledby="category-sizes-heading">
          <div className="grid gap-8 lg:grid-cols-[0.55fr_1.45fr] lg:gap-14">
            <div><p className="brand-eyebrow">Product formats</p><h2 id="category-sizes-heading" className="brand-title mt-3">Available sizes.</h2></div>
            <div className="grid grid-cols-2 border-l border-t border-slate-200 sm:grid-cols-3 md:grid-cols-5">
              {category.content.sizes.map((size) => (
                <div key={size} className="flex min-h-20 items-center justify-center border-b border-r border-slate-200 p-4 text-center font-display text-sm font-bold text-[#0B1F3A]">{size}</div>
              ))}
            </div>
          </div>
        </section>

        {category.content.materials && category.content.materials.length > 0 && (
          <section className="py-12" aria-labelledby="category-materials-heading">
            <div className="grid gap-8 lg:grid-cols-[0.55fr_1.45fr] lg:gap-14">
              <div><p className="brand-eyebrow">Substrate choices</p><h2 id="category-materials-heading" className="brand-title mt-3">Material options.</h2></div>
              <div className="border-t border-slate-200">
                {category.content.materials.map((material, index) => (
                  <div key={material} className="grid border-b border-slate-200 py-4 sm:grid-cols-[48px_1fr] sm:items-center"><span className="font-display font-bold text-[#FF6A00]">0{index + 1}</span><p className="font-display font-bold text-[#0B1F3A]">{material}</p></div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="my-12 border-l-4 border-[#FF6A00] bg-[#0B1F3A] p-7 text-white sm:p-10">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
            <div><h2 className="font-display text-3xl font-bold">Configure {category.title.toLowerCase()} online.</h2><p className="mt-3 max-w-2xl leading-7 text-slate-300">Upload artwork, review the on-screen preview, and see the current total before checkout.</p></div>
            <Link to="/design" className="brand-button-primary flex-none gap-2">Start designing <ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
          </div>
        </section>

        {category.relatedCategories.length > 0 && (
          <section className="pb-16 pt-6" aria-labelledby="related-products-heading">
            <p className="brand-eyebrow">Keep comparing</p>
            <h2 id="related-products-heading" className="brand-title mt-3">Related products.</h2>
            <div className="mt-8 grid border-l border-t border-slate-200 sm:grid-cols-2 lg:grid-cols-3">
              {category.relatedCategories.map((relatedSlug) => {
                const related = getCategoryBySlug(relatedSlug);
                if (!related) return null;
                return (
                  <Link key={relatedSlug} to={`/${relatedSlug}`} className="group border-b border-r border-slate-200 p-6 hover:bg-[#F7F7F7]">
                    <h3 className="font-display text-xl font-bold text-[#0B1F3A] group-hover:text-[#D95700]">{related.title}</h3>
                    <p className="mt-3 line-clamp-2 leading-6 text-slate-600">{related.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 font-bold text-[#0B1F3A]">View details <ArrowRight className="h-4 w-4 text-[#FF6A00]" /></span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
};

export default CategoryPage;
