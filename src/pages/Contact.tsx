import React, { useState, useEffect } from 'react';
import { Mail, Clock, Shield, Send, Phone, MessageCircle, CheckCircle, AlertCircle, MapPin, Zap, HeadphonesIcon } from 'lucide-react';
import Layout from '@/components/Layout';
import { useToast } from '@/components/ui/use-toast';
import { useLocation } from 'react-router-dom';

const Contact: React.FC = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle URL parameters from chatbot
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const from = searchParams.get('from');
    const message = searchParams.get('message');

    if (from === 'chatbot' && message) {
      setFormData(prev => ({
        ...prev,
        subject: 'Chatbot Inquiry',
        message: decodeURIComponent(message)
      }));
    }
  }, [location.search]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    // Basic validation
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/.netlify/functions/contact-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.ok) {
        toast({
          title: "Message Sent!",
          description: "Thank you for contacting us. We'll get back to you within 24 hours.",
        });

        // Reset form
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Contact form error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <div className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="text-center mb-16">
              <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight text-gray-900">
                Contact Our Support Team
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                Have questions about your banner order? Our expert team is here to help <span className="font-bold text-[#18448D]">24/7</span>.
              </p>
            </div>

            <div className="grid lg:grid-cols-5 gap-12">
              {/* Left Column - Contact Info (2 columns) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Contact Methods */}
                <div className="relative group">
                  
                  <div className="relative bg-white rounded-3xl p-8 shadow-xl border border-gray-100">
                    <h3 className="text-2xl font-bold mb-6 text-gray-900">Get In Touch</h3>
                    
                    <div className="space-y-6">
                      <div className="flex items-start group/item">
                        <div className="flex-shrink-0">
                          <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg transform group-hover/item:scale-110 transition-transform">
                            <Mail className="h-7 w-7 text-white" />
                          </div>
                        </div>
                        <div className="ml-5">
                          <p className="font-bold text-gray-900 text-lg mb-1">Email Support</p>
                          <p className="text-gray-600">support@bannersonthefly.com</p>
                          <p className="text-sm text-gray-500 mt-1">Response within 2 hours</p>
                        </div>
                      </div>

                      <div className="flex items-start group/item">
                        <div className="flex-shrink-0">
                          <div className="w-14 h-14 bg-[#18448D] rounded-2xl flex items-center justify-center shadow-lg transform group-hover/item:scale-110 transition-transform">
                            <HeadphonesIcon className="h-7 w-7 text-white" />
                          </div>
                        </div>
                        <div className="ml-5">
                          <p className="font-bold text-gray-900 text-lg mb-1">Live Chat</p>
                          <p className="text-gray-600">Available 24/7</p>
                          <p className="text-sm text-gray-500 mt-1">Instant assistance</p>
                        </div>
                      </div>

                      <div className="flex items-start group/item">
                        <div className="flex-shrink-0">
                          <div className="w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center shadow-lg transform group-hover/item:scale-110 transition-transform">
                            <MapPin className="h-7 w-7 text-white" />
                          </div>
                        </div>
                        <div className="ml-5">
                          <p className="font-bold text-gray-900 text-lg mb-1">Location</p>
                          <p className="text-gray-600">Nationwide Service</p>
                          <p className="text-sm text-gray-500 mt-1">Shipping to all 50 states</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Support Features */}
                <div className="relative group">
                  
                  <div className="relative bg-white rounded-3xl p-8 shadow-xl border border-gray-100">
                    <h3 className="text-2xl font-bold mb-6 text-gray-900">Why Contact Us?</h3>
                    
                    <div className="space-y-5">
                      <div className="flex items-start group/item">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center shadow-md transform group-hover/item:scale-110 transition-transform">
                            <Clock className="h-6 w-6 text-white" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <h4 className="font-bold text-gray-900 mb-1">Fast Response</h4>
                          <p className="text-gray-600 text-sm leading-relaxed">Average response time under 2 hours</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start group/item">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-md transform group-hover/item:scale-110 transition-transform">
                            <Shield className="h-6 w-6 text-white" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <h4 className="font-bold text-gray-900 mb-1">Expert Support</h4>
                          <p className="text-gray-600 text-sm leading-relaxed">Banner specialists ready to help</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start group/item">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-md transform group-hover/item:scale-110 transition-transform">
                            <Zap className="h-6 w-6 text-white" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <h4 className="font-bold text-gray-900 mb-1">Order Updates</h4>
                          <p className="text-gray-600 text-sm leading-relaxed">Real-time status on your orders</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Contact Form (3 columns) */}
              <div className="lg:col-span-3">
                <div className="relative group">
                  
                  <div className="relative bg-white rounded-3xl p-10 shadow-2xl border-2 border-gray-100">
                    <div className="mb-8">
                      <h3 className="text-3xl font-bold mb-2 text-gray-900">Send us a Message</h3>
                      <p className="text-gray-600">Fill out the form below and we'll get back to you shortly.</p>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="group/input">
                          <label htmlFor="name" className="block text-sm font-bold text-gray-700 mb-2">
                            Full Name
                          </label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#18448D] focus:border-[#18448D] transition-all duration-200 bg-gray-50 focus:bg-white hover:border-gray-300"
                            placeholder="John Doe"
                            required
                          />
                        </div>
                        
                        <div className="group/input">
                          <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
                            Email Address
                          </label>
                          <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#18448D] focus:border-[#18448D] transition-all duration-200 bg-gray-50 focus:bg-white hover:border-gray-300"
                            placeholder="john@example.com"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="group/input">
                        <label htmlFor="subject" className="block text-sm font-bold text-gray-700 mb-2">
                          Subject
                        </label>
                        <select
                          id="subject"
                          name="subject"
                          value={formData.subject}
                          onChange={handleInputChange}
                          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#18448D] focus:border-[#18448D] transition-all duration-200 bg-gray-50 focus:bg-white hover:border-gray-300"
                          required
                        >
                          <option value="">Select a topic</option>
                          <option value="order-inquiry">Order Inquiry</option>
                          <option value="design-help">Design Help</option>
                          <option value="shipping">Shipping Question</option>
                          <option value="billing">Billing Issue</option>
                          <option value="technical">Technical Support</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      
                      <div className="group/input">
                        <label htmlFor="message" className="block text-sm font-bold text-gray-700 mb-2">
                          Message
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          value={formData.message}
                          onChange={handleInputChange}
                          rows={6}
                          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#18448D] focus:border-[#18448D] transition-all duration-200 resize-none bg-gray-50 focus:bg-white hover:border-gray-300"
                          placeholder="Tell us how we can help you..."
                          required
                        />
                      </div>
                      
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-[#18448D] hover:bg-[#0f2d5c] text-white font-bold text-lg px-8 py-4 rounded-xl transition-colors duration-200 flex items-center justify-center shadow-lg hover:shadow-xl"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-6 w-6 mr-3" />
                            Send Message
                          </>
                        )}
                      </button>

                      <p className="text-center text-sm text-gray-500 mt-4">
                        We typically respond within <span className="font-semibold text-orange-600">2 hours</span> during business hours
                      </p>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;
