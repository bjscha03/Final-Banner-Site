import React, { useEffect, useState } from 'react';
import { Mail, MapPin, Send } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import SEO from '@/components/SEO';
import { useToast } from '@/components/ui/use-toast';

const Contact: React.FC = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('from') === 'chatbot' && searchParams.get('message')) {
      setFormData((previous) => ({
        ...previous,
        subject: 'Chatbot Inquiry',
        message: decodeURIComponent(searchParams.get('message') || ''),
      }));
    }
  }, [location.search]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast({ title: 'Missing information', description: 'Please fill in all fields before submitting.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/.netlify/functions/contact-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Failed to send message');
      toast({ title: 'Message sent', description: 'Thank you for contacting us. Our team will review your message.' });
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (error) {
      toast({ title: 'Message not sent', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout showFooterBanner={false}>
      <SEO
        title="Contact Banners On The Fly | Order & Artwork Support"
        description="Contact Banners On The Fly about product options, artwork, shipping, billing, technical questions, or an existing custom print order."
        canonical="https://bannersonthefly.com/contact"
      />
      <PageHeader
        title="Contact our support team"
        subtitle="Send the details that matter—product, size, quantity, artwork question, deadline, or order number—and we’ll route the message correctly."
        centered={false}
      />

      <section className="brand-section bg-[#F7F7F7]">
        <div className="brand-shell grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <aside>
            <p className="brand-eyebrow">Direct support</p>
            <h2 className="brand-title mt-3">Give us enough context to help.</h2>
            <p className="brand-copy mt-5">For an existing order, include the order number and the email used at checkout. For a new project, include the product, finished size, quantity, and needed-by date.</p>

            <div className="mt-8 border-y border-slate-300">
              <a href="mailto:support@bannersonthefly.com" className="flex gap-4 border-b border-slate-300 py-5 text-[#0B1F3A] hover:text-[#D95700]">
                <Mail className="mt-0.5 h-5 w-5 flex-none text-[#FF6A00]" aria-hidden="true" />
                <div><p className="font-display font-bold">Email support</p><p className="mt-1 text-sm text-slate-600">support@bannersonthefly.com</p></div>
              </a>
              <div className="flex gap-4 py-5">
                <MapPin className="mt-0.5 h-5 w-5 flex-none text-[#FF6A00]" aria-hidden="true" />
                <div><p className="font-display font-bold text-[#0B1F3A]">Nationwide shipping</p><p className="mt-1 text-sm text-slate-600">Online ordering and delivery across the United States.</p></div>
              </div>
            </div>
          </aside>

          <div className="border border-slate-200 bg-white p-6 sm:p-8 lg:p-10">
            <h2 className="font-display text-2xl font-bold text-[#0B1F3A] sm:text-3xl">Send a message</h2>
            <p className="mt-2 text-slate-600">All fields are required.</p>
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <ContactField label="Full name" htmlFor="name">
                  <input id="name" name="name" value={formData.name} onChange={handleInputChange} className="brand-field" autoComplete="name" required />
                </ContactField>
                <ContactField label="Email address" htmlFor="email">
                  <input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} className="brand-field" autoComplete="email" required />
                </ContactField>
              </div>
              <ContactField label="What can we help with?" htmlFor="subject">
                <select id="subject" name="subject" value={formData.subject} onChange={handleInputChange} className="brand-field" required>
                  <option value="">Select a topic</option>
                  <option value="order-inquiry">Existing order</option>
                  <option value="design-help">Artwork or design help</option>
                  <option value="shipping">Production or shipping</option>
                  <option value="billing">Billing</option>
                  <option value="technical">Technical support</option>
                  <option value="other">Other</option>
                </select>
              </ContactField>
              <ContactField label="Message" htmlFor="message">
                <textarea id="message" name="message" value={formData.message} onChange={handleInputChange} rows={7} className="brand-field resize-y" placeholder="Include the product, size, quantity, deadline, or order number when relevant." required />
              </ContactField>
              <button type="submit" disabled={isSubmitting} className="brand-button-primary w-full gap-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                {isSubmitting ? 'Sending…' : <><Send className="h-5 w-5" aria-hidden="true" />Send message</>}
              </button>
            </form>
          </div>
        </div>
      </section>
    </Layout>
  );
};

const ContactField = ({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-[#0B1F3A]">{label}</label>
    {children}
  </div>
);

export default Contact;
