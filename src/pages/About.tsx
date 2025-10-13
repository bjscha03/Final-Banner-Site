import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Users, Clock, Shield, Target, Heart, Zap, CheckCircle, Sparkles, TrendingUp, Star } from 'lucide-react';
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
    { icon: Clock, value: '24hr', label: 'Production Time', color: 'from-blue-500 to-blue-600', iconColor: 'text-blue-600' },
    { icon: Shield, value: '100%', label: 'Satisfaction Rate', color: 'from-green-500 to-green-600', iconColor: 'text-green-600' },
    { icon: Users, value: '10k+', label: 'Happy Customers', color: 'from-orange-500 to-orange-600', iconColor: 'text-orange-600' },
    { icon: Award, value: 'Free', label: 'Shipping Over $100', color: 'from-purple-500 to-purple-600', iconColor: 'text-purple-600' }
  ];

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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-100 to-transparent rounded-full blur-3xl opacity-30 -z-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-orange-100 to-transparent rounded-full blur-3xl opacity-30 -z-10"></div>

        {/* Hero Section */}
        <div className="relative pt-20 pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-orange-50 to-blue-50 rounded-full border border-orange-200 shadow-lg mb-8 backdrop-blur-sm">
                <div className="w-2 h-2 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full mr-3 animate-pulse"></div>
                <span className="text-sm font-semibold bg-gradient-to-r from-[#18448D] to-orange-600 bg-clip-text text-transparent">About Our Company</span>
              </div>

              <h1 className="text-5xl md:text-7xl font-black mb-8 tracking-tight">
                <span className="bg-gradient-to-r from-[#18448D] via-blue-600 to-[#18448D] bg-clip-text text-transparent">
                  Banners On The Fly
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-gray-700 max-w-4xl mx-auto leading-relaxed mb-12">
                Your trusted partner for <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">professional vinyl banners</span> with
                <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#18448D] to-blue-600"> lightning-fast delivery</span> and
                <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600"> unmatched quality</span>
              </p>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
                {stats.map((stat, index) => (
                  <div key={index} className="group relative">
                    <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} rounded-2xl blur opacity-25 group-hover:opacity-40 transition-opacity`}></div>
                    <div className="relative bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 border border-gray-100">
                      <stat.icon className={`h-8 w-8 ${stat.iconColor} mx-auto mb-3`} />
                      <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
                      <div className="text-sm text-gray-600">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Story Section */}
        <div className="relative py-20 bg-gradient-to-br from-white to-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left Column - Content */}
              <div className="relative">
                <div className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-orange-50 to-blue-50 rounded-full border border-orange-200 shadow-md mb-8">
                  <div className="w-2 h-2 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full mr-3 animate-pulse"></div>
                  <span className="text-sm font-semibold bg-gradient-to-r from-[#18448D] to-orange-600 bg-clip-text text-transparent">Our Journey</span>
                </div>

                <h2 className="text-4xl md:text-5xl font-bold mb-8">
                  <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                    Our Story
                  </span>
                </h2>

                <div className="space-y-6 text-lg text-gray-700 leading-relaxed">
                  <p className="relative pl-6 border-l-4 border-orange-500">
                    Founded with a <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">simple mission</span>: to provide businesses with high-quality vinyl banners
                    delivered faster than anyone else in the industry. We recognized that businesses needed
                    professional signage solutions without the long wait times.
                  </p>
                  <p className="relative pl-6 border-l-4 border-blue-600">
                    Our <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#18448D] to-blue-600">state-of-the-art printing facility</span> operates 24/7, ensuring that your banners are
                    printed, finished, and shipped within 24 hours of order confirmation. We've served over
                    <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600"> 10,000 satisfied customers</span> nationwide, from small local businesses to Fortune 500 companies.
                  </p>
                  <p className="relative pl-6 border-l-4 border-orange-500">
                    What sets us apart is our commitment to <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">quality materials</span>,
                    <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600"> competitive pricing</span>, and
                    <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#18448D] to-blue-600"> exceptional customer service</span>. Every banner is printed on premium vinyl materials and
                    undergoes rigorous quality control before shipping.
                  </p>
                </div>

                {/* Mission Card */}
                <div className="mt-10 relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#18448D] to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity"></div>
                  <div className="relative bg-white border-2 border-blue-100 rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#18448D] to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                          <Target className="h-6 w-6 text-white" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold bg-gradient-to-r from-[#18448D] to-blue-600 bg-clip-text text-transparent mb-3">Our Mission</h3>
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
                <div className="absolute inset-0 bg-gradient-to-br from-orange-200 to-blue-200 rounded-3xl blur-2xl opacity-30"></div>
                <div className="relative bg-gradient-to-br from-white to-gray-50 rounded-3xl p-12 shadow-2xl border border-gray-200">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-orange-500 to-orange-600 rounded-3xl shadow-2xl mb-6 transform hover:scale-110 transition-transform">
                      <Award className="h-12 w-12 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">Industry Leader</h3>
                    <p className="text-gray-600 text-lg leading-relaxed">
                      Recognized for excellence in banner printing and customer satisfaction
                    </p>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                        <div className="text-3xl font-bold text-[#18448D]">A+</div>
                        <div className="text-sm text-gray-600">Rating</div>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
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
        <div className="py-20 bg-gradient-to-br from-gray-50 to-white relative">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full">
            <div className="absolute top-0 right-1/4 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-20"></div>
            <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-orange-200 rounded-full blur-3xl opacity-20"></div>
          </div>
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
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
                  <div className={`absolute inset-0 bg-gradient-to-br ${value.gradient} rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity`}></div>
                  <div className="relative bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 transform hover:-translate-y-2">
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${value.gradient} mb-6 shadow-lg transform group-hover:scale-110 transition-transform`}>
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
        <div className="py-20 bg-gradient-to-br from-white to-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
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
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
                      <div className="relative w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-2xl flex items-center justify-center font-bold shadow-lg transform group-hover:scale-110 transition-transform">
                        <milestone.icon className="h-8 w-8" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-orange-100 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity"></div>
                    <div className="relative bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">{milestone.year}</span>
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
        <div className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-orange-600 to-[#18448D]"></div>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6TTI0IDM0YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTAtMTBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00ek00OCAzNGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTAtMTBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-10"></div>
          
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
                className="group relative px-10 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105 overflow-hidden"
              >
                <span className="relative z-10">Start Designing</span>
                <div className="absolute inset-0 bg-gradient-to-r from-orange-50 to-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>
              <button
                onClick={handleContactUs}
                className="group relative px-10 py-4 bg-[#18448D] text-white rounded-xl font-bold text-lg shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105 overflow-hidden border-2 border-white/20"
              >
                <span className="relative z-10">Contact Us</span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default About;
