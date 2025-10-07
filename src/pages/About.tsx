import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Users, Clock, Shield, Target, Heart, Zap, CheckCircle } from 'lucide-react';
import Layout from '@/components/Layout';
import { useScrollToTop } from '@/components/ScrollToTop';

const About: React.FC = () => {
  const navigate = useNavigate();
  const { scrollToTop } = useScrollToTop();

  const handleStartDesigning = () => {
    console.log('🚀 Start Designing button clicked');
    scrollToTop();
    console.log('📍 Navigating to /design');
    navigate('/design');
  };

  const handleContactUs = () => {
    console.log('📞 Contact Us button clicked');
    scrollToTop();
    console.log('📍 Navigating to /contact');
    navigate('/contact');
  };
  const stats = [
    { icon: Clock, value: '24hr', label: 'Production Time', color: 'text-white' },
    { icon: Shield, value: '100%', label: 'Satisfaction Rate', color: 'text-green-600' },
    { icon: Users, value: '10k+', label: 'Happy Customers', color: 'text-orange-600' },
    { icon: Award, value: 'Free', label: 'Shipping Over $100', color: 'text-purple-600' }
  ];

  const values = [
    {
      icon: Zap,
      title: 'Speed',
      description: 'Lightning-fast 24-hour production and shipping to get your banners when you need them.'
    },
    {
      icon: Shield,
      title: 'Quality',
      description: 'Premium materials and rigorous quality control ensure every banner meets our high standards.'
    },
    {
      icon: Heart,
      title: 'Service',
      description: 'Dedicated customer support team ready to help with design, ordering, and any questions.'
    },
    {
      icon: Target,
      title: 'Precision',
      description: 'State-of-the-art printing technology delivers crisp, vibrant colors and sharp details.'
    }
  ];

  const milestones = [
    { year: '2018', title: 'Company Founded', description: 'Started with a vision to revolutionize banner printing' },
    { year: '2019', title: '1,000 Customers', description: 'Reached our first major milestone of satisfied customers' },
    { year: '2020', title: 'Facility Expansion', description: 'Doubled production capacity to meet growing demand' },
    { year: '2021', title: '24/7 Operations', description: 'Launched round-the-clock production for faster delivery' },
    { year: '2022', title: '10,000 Orders', description: 'Celebrated processing our 10,000th banner order' },
    { year: '2024', title: 'Digital Innovation', description: 'Launched our advanced online design tool and ordering system' }
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-white relative overflow-hidden">
        {/* Hero Section */}
        <div className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center justify-center px-6 py-3 bg-slate-50 rounded-full border border-slate-200 shadow-sm mb-8">
                <div className="w-2 h-2 bg-orange-500 rounded-full mr-3 animate-pulse"></div>
                <span className="text-sm font-semibold text-gray-700">About Our Company</span>
              </div>

              <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 tracking-tight">
                Banners On The Fly
              </h1>

              <p className="text-xl md:text-2xl text-gray-700 max-w-4xl mx-auto leading-relaxed mb-12">
                Your trusted partner for <span className="font-bold text-orange-500">professional vinyl banners</span> with
                <span className="font-bold text-[#18448D]"> lightning-fast delivery</span> and
                <span className="font-bold text-orange-600"> unmatched quality</span>
              </p>

              {/* Modern CTA */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <div className="bg-[#18448D] text-white px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                  <div className="text-2xl font-bold">24hr</div>
                  <div className="text-sm opacity-90">Production</div>
                </div>
                <div className="bg-orange-500 text-white px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                  <div className="text-2xl font-bold">100%</div>
                  <div className="text-sm opacity-90">Satisfaction</div>
                </div>
                <div className="bg-orange-600 text-white px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                  <div className="text-2xl font-bold">10k+</div>
                  <div className="text-sm opacity-90">Happy Customers</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Our Values Section */}

        {/* Story Section */}
        <div className="relative py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left Column - Content */}
              <div className="relative">
                <div className="inline-flex items-center justify-center px-6 py-3 bg-slate-50 rounded-full border border-slate-200 shadow-sm mb-8">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3 animate-pulse"></div>
                  <span className="text-sm font-semibold text-gray-700">Our Journey</span>
                </div>

                <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-8">
                  Our Story
                </h2>

                <div className="space-y-6 text-lg text-gray-700 leading-relaxed">
                  <p>
                    Founded with a <span className="font-semibold text-orange-500">simple mission</span>: to provide businesses with high-quality vinyl banners
                    delivered faster than anyone else in the industry. We recognized that businesses needed
                    professional signage solutions without the long wait times.
                  </p>
                  <p>
                    Our <span className="font-semibold text-[#18448D]">state-of-the-art printing facility</span> operates 24/7, ensuring that your banners are
                    printed, finished, and shipped within 24 hours of order confirmation. We've served over
                    <span className="font-semibold text-orange-600"> 10,000 satisfied customers</span> nationwide, from small local businesses to Fortune 500 companies.
                  </p>
                  <p>
                    What sets us apart is our commitment to <span className="font-semibold text-orange-500">quality materials</span>,
                    <span className="font-semibold text-orange-500"> competitive pricing</span>, and
                    <span className="font-semibold text-[#18448D]"> exceptional customer service</span>. Every banner is printed on premium vinyl materials and
                    undergoes rigorous quality control before shipping.
                  </p>
                </div>

                {/* Mission Card */}
                <div className="mt-10 relative bg-white border border-slate-200 rounded-lg p-8 shadow-sm backdrop-blur-sm">
                  <div className="relative">
                    <h3 className="text-xl font-bold bg-[#18448D] bg-clip-text text-transparent mb-4">Our Mission</h3>
                    <p className="text-gray-700 leading-relaxed">
                      To empower businesses with professional-grade banners that help them stand out,
                      attract customers, and grow their brand - all delivered with unmatched speed and quality.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column - Image Placeholder */}
              <div className="bg-slate-50 rounded-xl p-8 text-center">
                <div className="bg-white rounded-lg p-8 shadow-md">
                  <Award className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Industry Leader</h3>
                  <p className="text-gray-600">
                    Recognized for excellence in banner printing and customer satisfaction
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Values Section */}
        <div className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Values</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The principles that guide everything we do and every banner we create.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {values.map((value, index) => (
                <div key={index} className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-500 mb-4">
                    <value.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{value.title}</h3>
                  <p className="text-gray-600">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline Section */}
        <div className="py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Journey</h2>
              <p className="text-xl text-gray-600">
                Key milestones in our mission to revolutionize banner printing.
              </p>
            </div>

            <div className="space-y-8">
              {milestones.map((milestone, index) => (
                <div key={index} className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      {milestone.year.slice(-2)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-6 shadow-md border border-gray-200 flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm font-medium text-orange-500">{milestone.year}</span>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{milestone.title}</h3>
                    <p className="text-gray-600">{milestone.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-16 bg-orange-500">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Experience the Difference?
            </h2>
            <p className="text-xl text-white mb-8">
              Join thousands of satisfied customers who trust us with their banner needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
              <button
                onClick={handleStartDesigning}
                className="bg-white text-orange-500 px-8 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors cursor-pointer relative z-10"
              >
                Start Designing
              </button>
              <button
                onClick={handleContactUs}
                className="bg-[#18448D] text-white px-8 py-3 rounded-lg font-medium hover:bg-[#18448D]/90 transition-colors cursor-pointer relative z-10"
              >
                Contact Us
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default About;
