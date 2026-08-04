import React, { useState } from 'react';
import { Mail, MapPin, Linkedin, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ScrollToTopLink from '@/components/ScrollToTopLink';

const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/.netlify/functions/newsletter-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSubmitStatus('success');
        setEmail('');
        toast({
          title: "Success!",
          description: data.message,
          duration: 5000,
        });
      } else {
        setSubmitStatus('error');
        toast({
          title: "Subscription Failed",
          description: data.error || "Failed to subscribe. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Newsletter signup error:', error);
      setSubmitStatus('error');
      toast({
        title: "Network Error",
        description: "Failed to connect. Please check your internet connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);

      // Reset status after 3 seconds
      setTimeout(() => {
        setSubmitStatus('idle');
      }, 3000);
    }
  };

  const quickLinks = [
    { name: 'Vinyl Banners', href: '/vinyl-banners' },
    { name: 'Yard Signs', href: '/yard-signs' },
    { name: 'Car Magnets', href: '/car-magnets' },
    { name: 'Custom Quote', href: '/custom-quote' },
    { name: 'Design Tool', href: '/design' },
  ];

  const companyLinks = [
    { name: 'About Us', href: '/about' },
    { name: 'Blog', href: '/blog' },
    { name: 'Contact', href: '/contact' },
    { name: 'FAQ', href: '/faq' },
  ];

  const supportLinks = [
    { name: 'Contact Support', href: '/contact' },
    { name: 'Terms & Conditions', href: '/terms' },
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Shipping Info', href: '/shipping' }
  ];

  return (
    <footer className="relative bg-[#07182E] text-white">
      <div className="h-1 bg-[#FF6A00]" />
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr_1.2fr]">
          {/* Company Info */}
          <div className="min-w-0 md:col-span-1">
            <h3 className="font-display text-2xl font-bold text-white mb-4">
              Banners On The Fly
            </h3>
            <p className="max-w-sm text-sm leading-6 text-slate-300 mb-6">
              Custom banners, yard signs, and car magnets ordered online and shipped nationwide.
              Production time and carrier transit time are shown separately.
            </p>
            <div className="space-y-2">
              <a href="mailto:support@bannersonthefly.com" className="flex min-h-11 min-w-0 items-center text-slate-300 transition-colors hover:text-white">
                <Mail className="mr-2 h-4 w-4 flex-none" />
                <span className="min-w-0 break-all text-sm">support@bannersonthefly.com</span>
              </a>
              <div className="flex items-center text-slate-300">
                <MapPin className="h-4 w-4 mr-2" />
                <span className="text-sm">Nationwide Shipping</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="min-w-0">
            <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-white mb-5">Products</h4>
            <ul className="space-y-2">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <ScrollToTopLink
                    to={link.href}
                    className="flex min-h-11 items-center text-sm text-slate-300 transition-colors hover:text-white"
                  >
                    {link.name}
                  </ScrollToTopLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <h4 className="mb-5 text-sm font-bold uppercase tracking-[0.16em] text-white">Company</h4>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <ScrollToTopLink to={link.href} className="flex min-h-11 items-center text-sm text-slate-300 transition-colors hover:text-white">
                    {link.name}
                  </ScrollToTopLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div className="min-w-0">
            <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-white mb-5">Support</h4>
            <ul className="space-y-2">
              {supportLinks.map((link, index) => (
                <li key={index}>
                  <ScrollToTopLink
                    to={link.href}
                    className="flex min-h-11 items-center text-sm text-slate-300 transition-colors hover:text-white"
                  >
                    {link.name}
                  </ScrollToTopLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div className="min-w-0">
            <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-white mb-5">Print notes & offers</h4>
            <p className="text-slate-300 text-sm leading-6 mb-4">
              Get exclusive offers and signage printing tips delivered to your inbox.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="space-y-3">
              <div className="flex min-w-0">
                <input
                  id="footer-newsletter-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className={`min-h-11 min-w-0 flex-1 rounded-l-md border bg-white/5 px-3 py-2 text-white placeholder-slate-400 transition-colors focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/30 ${
                    submitStatus === 'success'
                      ? 'border-green-500 focus:ring-green-500'
                      : submitStatus === 'error'
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-white/20'
                  }`}
                  required
                  disabled={isSubmitting}
                  aria-label="Email address for newsletter"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  aria-label="Subscribe to newsletter"
                  className={`min-h-11 px-4 py-2 rounded-r-lg transition-colors flex items-center justify-center min-w-[48px] ${
                    submitStatus === 'success'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : submitStatus === 'error'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : isSubmitting
                      ? 'cursor-not-allowed bg-gray-500 text-white'
                      : 'bg-[#FF6A00] text-[#0B1F3A] hover:bg-[#E65F00]'
                  }`}
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : submitStatus === 'success' ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : submitStatus === 'error' ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
            <div className="mt-4">
              <a
                href="https://www.linkedin.com/company/banners-on-the-fly/about/?viewAsMember=true"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center space-x-2 text-slate-300 transition-colors hover:text-white"
              >
                <Linkedin className="h-5 w-5" />
                <span className="text-sm">Follow us on LinkedIn</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-white/10 pt-7">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-slate-400 text-sm">
              © {new Date().getFullYear()} Banners On The Fly. All rights reserved.
            </p>
            <div className="mt-4 flex flex-col items-center gap-2 text-center sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 md:mt-0 md:justify-end md:text-left">
              <span className="text-slate-400 text-sm">Online ordering · Nationwide shipping</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#FF6A00]" aria-hidden="true"></div>
                <span className="text-slate-300 text-sm">Secure checkout</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
