import React, { useState } from 'react';
import { Mail, Clock, Shield, Send, Phone, MessageCircle } from 'lucide-react';

const ContactSection: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Form submission logic would go here (Supabase integration)
    console.log('Contact form submitted:', formData);
    // Reset form
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Contact Our Support Team
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Have questions about your banner order? Our expert team is here to help 24/7.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left Column - Contact Info */}
          <div className="space-y-8">
            <div className="bg-white rounded-xl p-8 text-slate-900">
              <h3 className="text-xl font-semibold mb-6">Get In Touch</h3>
              
              <div className="space-y-4">
                <div className="flex items-center">
                  <div className="bg-blue-500 p-2 rounded-lg mr-4">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Email Support</p>
                    <p className="text-blue-100">support@bannersonthefly.com</p>
                  </div>
                </div>
                

                
                <div className="flex items-center">
                  <div className="bg-blue-500 p-2 rounded-lg mr-4">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Live Chat</p>
                    <p className="text-blue-100">Instant support online</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Support Features */}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                <div className="flex items-center mb-3">
                  <Clock className="h-5 w-5 text-green-600 mr-2" />
                  <h4 className="font-semibold text-green-800">24/7 Availability</h4>
                </div>
                <p className="text-green-700 text-sm">
                  Our support team is available around the clock to help with urgent orders and questions.
                </p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center mb-3">
                  <Shield className="h-5 w-5 text-blue-600 mr-2" />
                  <h4 className="font-semibold text-blue-800">Quality Guarantee</h4>
                </div>
                <p className="text-blue-700 text-sm">
                  100% satisfaction guarantee with free reprints if you're not completely satisfied.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Contact Form */}
          <div className="bg-gray-50 rounded-xl p-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Send us a Message</h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="john@company.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                  Subject
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a topic</option>
                  <option value="order-question">Order Question</option>
                  <option value="design-help">Design Help</option>
                  <option value="shipping">Shipping & Delivery</option>
                  <option value="quality-issue">Quality Issue</option>
                  <option value="billing">Billing Question</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  required
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Please describe your question or concern in detail..."
                />
              </div>

              <button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
              >
                <Send className="h-5 w-5" />
                <span>Send Message</span>
              </button>
            </form>

            <div className="mt-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-orange-800 text-sm">
                <strong>Quick Response:</strong> We typically respond to all inquiries within 1 hour during business hours.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;