import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DesignComplete: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/design');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <Layout>
      <PageHeader
        title="Design Complete"
        subtitle="Your Canva design has been saved"
        icon={CheckCircle}
      />
      
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Design Successfully Saved!
          </h2>
          
          <p className="text-gray-600 mb-6">
            Your Canva design has been uploaded to Cloudinary and is ready to use.
          </p>
          
          {orderId && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-500 mb-1">Order ID</p>
              <p className="font-mono text-sm text-gray-900">{orderId}</p>
            </div>
          )}
          
          <p className="text-sm text-gray-500 mb-6">
            Redirecting to design page in {countdown} seconds...
          </p>
          
          <Button
            onClick={() => navigate('/design')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Continue to Design Page
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default DesignComplete;
