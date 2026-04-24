import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, GraduationCap, ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';

const GraduationSignsThankYou: React.FC = () => {
  const [searchParams] = useSearchParams();
  const intakeId = searchParams.get('intakeId');

  return (
    <Layout>
      <Helmet>
        <title>Design Request Received | Banners On The Fly</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <section className="bg-[#0B1F3A] py-16 text-center text-white">
        <div className="max-w-3xl mx-auto px-4">
          <GraduationCap className="mx-auto h-14 w-14 text-[#FF6A00] mb-4" />
          <h1 className="text-4xl font-black tracking-tight">
            Thanks — your $19 design deposit has been received! 🎓
          </h1>
          <p className="mt-4 text-lg text-white/85">
            Our designers will create your proof and email it to you for approval.
          </p>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>

          <h2 className="text-2xl font-bold text-[#0B1F3A] mb-4">
            We're on it!
          </h2>

          <div className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-6 text-left space-y-3 text-[#0B1F3A] mb-8">
            <p>✅ <strong>Your design request has been received.</strong></p>
            <p>🎨 We're creating your custom graduation design now. You'll receive a proof shortly to review and approve.</p>
            <p>🚀 Once approved, we'll print and ship fast — FREE next-day air.</p>
          </div>

          {intakeId && (
            <p className="text-sm text-gray-400 mb-6">
              Reference: {intakeId}
            </p>
          )}

          <p className="text-gray-600 mb-8">
            Questions? Email us at{' '}
            <a href="mailto:info@bannersonthefly.com" className="text-[#FF6A00] underline">
              info@bannersonthefly.com
            </a>
          </p>

          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold px-8 py-3 text-lg shadow-md transition"
          >
            Back to Home <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </Layout>
  );
};

export default GraduationSignsThankYou;
