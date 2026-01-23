import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Users, Clock, Shield, Target, Heart, Zap, CheckCircle, Sparkles, TrendingUp, Star } from 'lucide-react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
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



  const values = [
    {
      icon: Zap,
      title: 'Speed',
      description: 'Lightning-fast 24-hour production and shipping to get your banners when you need them.',
      gradient: 'from-yellow-400 to-orange-500'
    },
    {
      icon: Shield,
      title: 'Quality',
      description: 'Premium materials and rigorous quality control ensure every banner meets our high standards.',
      gradient: 'from-blue-400 to-blue-600'
    },
    {
      icon: Heart,
      title: 'Service',
      description: 'Dedicated customer support team ready to help with design, ordering, and any questions.',
      gradient: 'from-pink-400 to-red-500'
    },
    {
      icon: Target,
      title: 'Precision',
      description: 'State-of-the-art printing technology delivers crisp, vibrant colors and sharp details.',
      gradient: 'from-purple-400 to-indigo-600'
    }
  ];

  const milestones = [
    { year: '2018', title: 'Company Founded', description: 'Started with a vision to revolutionize banner printing', icon: Sparkles },
    { year: '2019', title: '1,000 Customers', description: 'Reached our first major milestone of satisfied customers', icon: Users },
    { year: '2020', title: 'Facility Expansion', description: 'Doubled production capacity to meet growing demand', icon: TrendingUp },
    { year: '2021', title: '24/7 Operations', description: 'Launched round-the-clock production for faster delivery', icon: Clock },
    { year: '2022', title: '10,000 Orders', description: 'Celebrated processing our 10,000th banner order', icon: Star },
    { year: '2024', title: 'Digital Innovation', description: 'Launched our advanced online design tool and ordering system', icon: Zap }
  ];

  return (
    <Layout>
      <PageHeader
        title="About Banners on the Fly"
        subtitle="Your trusted partner for professional vinyl banners with lightning-fast delivery and unmatched quality."
        icon={Heart}
      />
      
      <div className="min-h-screen bg-gray-50 relative overflow-hidden">


        {/* Story Section */}
        <div className="relative py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left Column - Content */}
              <div className="relative">


                <h2 className="text-4xl md:text-5xl font-bold mb-8">
                  <span className="text-gray-900">
                    Our Story
                  </span>
                </h2>

                <div className="space-y-6 text-lg text-gray-700 leading-relaxed">
                  <p className="relative pl-6 border-l-4 border-orange-500">
                    Founded with a <span className="font-semibold text-orange-500">simple mission</span>: to provide businesses with high-quality vinyl banners
                    delivered faster than anyone else in the industry. We recognized that businesses needed
                    professional signage solutions without the long wait times.
                  </p>
                  <p className="relative pl-6 border-l-4 border-blue-600">
                    Our <span className="font-semibold text-[#18448D]">state-of-the-art printing facility</span> operates 24/7, ensuring that your banners are
                    printed, finished, and shipped within 24 hours of order confirmation. We've served over
                    <span className="font-semibold text-orange-600"> 10,000 satisfied customers</span> nationwide, from small local businesses to Fortune 500 companies.
                  </p>
                  <p className="relative pl-6 border-l-4 border-orange-500">
                    What sets us apart is our commitment to <span className="font-semibold text-orange-500">quality materials</span>,
                    <span className="font-semibold text-orange-500"> competitive pricing</span>, and
                    <span className="font-semibold text-[#18448D]"> exceptional customer service</span>. Every banner is printed on premium vinyl materials and
                    undergoes rigorous quality control before shipping.
                  </p>
                </div>

                {/* Mission Card */}
                <div className="mt-10 relative group">
                  
                  <div className="relative bg-white border-2 border-blue-100 rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-[#18448D] rounded-xl flex items-center justify-center shadow-lg">
                          <Target className="h-6 w-6 text-white" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-[#18448D] mb-3">Our Mission</h3>
                        <p className="text-gray-700 leading-relaxed">
                          To empower businesses with professional-grade banners that help them stand out,
                          attract customers, and grow their brand - all delivered with unmatched speed and quality.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Visual Element */}
              <div className="relative">
                
                <div className="relative bg-white rounded-3xl p-12 shadow-2xl border border-gray-200">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-orange-500 rounded-3xl shadow-2xl mb-6 transform hover:scale-110 transition-transform">
                      <Award className="h-12 w-12 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">Industry Leader</h3>
                    <p className="text-gray-600 text-lg leading-relaxed">
                      Recognized for excellence in banner printing and customer satisfaction
                    </p>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <div className="text-3xl font-bold text-[#18448D]">A+</div>
                        <div className="text-sm text-gray-600">Rating</div>
                      </div>
                      <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
                        <div className="text-3xl font-bold text-orange-600">5★</div>
                        <div className="text-sm text-gray-600">Reviews</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Values Section */}
        <div className="py-20 bg-gray-50 relative">

          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="text-gray-900">
                  Our Values
                </span>
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The principles that guide everything we do and every banner we create.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {values.map((value, index) => (
                <div key={index} className="group relative">
                  
                  <div className="relative bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 transform hover:-translate-y-2">
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 mb-6 shadow-lg transform group-hover:scale-110 transition-transform`}>
                      <value.icon className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{value.title}</h3>
                    <p className="text-gray-600 leading-relaxed">{value.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline Section */}
        <div className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="text-gray-900">
                  Our Journey
                </span>
              </h2>
              <p className="text-xl text-gray-600">
                Key milestones in our mission to revolutionize banner printing.
              </p>
            </div>

            <div className="space-y-8">
              {milestones.map((milestone, index) => (
                <div key={index} className="flex items-start space-x-6 group">
                  <div className="flex-shrink-0">
                    <div className="relative">
                      
                      <div className="relative w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center font-bold shadow-lg transform group-hover:scale-110 transition-transform">
                        <milestone.icon className="h-8 w-8" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 relative group">
                    
                    <div className="relative bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className="text-sm font-bold text-orange-500">{milestone.year}</span>
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{milestone.title}</h3>
                      <p className="text-gray-600 leading-relaxed">{milestone.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="relative py-20 overflow-hidden bg-[#18448D]">
          
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to Experience the Difference?
            </h2>
            <p className="text-xl md:text-2xl text-white/90 mb-10 leading-relaxed">
              Join thousands of satisfied customers who trust us with their banner needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <button
                onClick={handleStartDesigning}
                className="px-10 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-gray-50"
              >
                Start Designing
              </button>
              <button
                onClick={handleContactUs}
                className="px-10 py-4 bg-white text-[#18448D] rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-gray-50"
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
