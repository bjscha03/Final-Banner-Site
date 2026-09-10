import { useState, useRef } from 'react';
import { X, Mail, Copy, Check, Package, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PromoPopupProps {
  onClose: () => void;
  source: 'first_visit' | 'exit_intent';
}

export const PromoPopup = ({ onClose, source }: PromoPopupProps) => {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double-submission
    if (isSubmittingRef.current) {
      console.log('[PromoPopup] Submission already in progress, ignoring');
      return;
    }
    
    if (!email || !consent) {
      toast({
        title: 'Missing information',
        description: 'Please enter your email and accept the privacy policy',
        variant: 'destructive',
      });
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch('/.netlify/functions/send-discount-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          consent,
          source,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate code');
      }

      setGeneratedCode(data.code);
      
      // Mark email as submitted - NEVER show popup again
      localStorage.setItem('promo_email_submitted', 'true');
      localStorage.setItem('promo_code_received', 'true');
      
      toast({
        title: '🎉 Success!',
        description: `Your code ${data.code} has been sent to ${email}`,
      });
    } catch (error) {
      console.error('Error generating code:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate discount code',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const handleCopyCode = async () => {
    if (!generatedCode) return;

    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      
      toast({
        title: 'Code copied!',
        description: 'Paste it at checkout to save 20%',
      });

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
      toast({
        title: 'Copy failed',
        description: 'Please manually copy the code: ' + generatedCode,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      {/* Backdrop - Darkened overlay */}
      <div 
        className="fixed inset-0 bg-black/70 z-50 animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Popup */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative pointer-events-auto animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="p-8">
            {!generatedCode ? (
              <>
                {/* Header with Product Visual */}
                <div className="text-center mb-6">
                  {/* Product Visual - Tag Icon */}
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full mb-4">
                    <Tag className="w-10 h-10 text-orange-600" />
                  </div>
                  
                  <h2 className="text-3xl font-bold text-[#18448D] mb-3">
                    Get 20% OFF your First Order!
                  </h2>
                  
                  {/* Free Shipping Badge */}
                  <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full mb-3">
                    <Package className="w-4 h-4" />
                    <span className="text-sm font-semibold">Free Next-Day Air Shipping Included</span>
                  </div>
                  
                  <p className="text-gray-600">
                    Enter your email to receive your exclusive discount code
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email Input */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ff6b35] focus:border-transparent outline-none transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Privacy Consent */}
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="consent"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-1 w-4 h-4 text-[#ff6b35] border-gray-300 rounded focus:ring-[#ff6b35]"
                      required
                    />
                    <label htmlFor="consent" className="text-sm text-gray-600">
                      I agree to the{' '}
                      <a href="/privacy" className="text-[#18448D] hover:underline" target="_blank">
                        privacy policy
                      </a>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !email || !consent}
                    className="w-full bg-[#ff6b35] hover:bg-[#f7931e] text-white font-semibold py-3 px-6 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Generating Code...' : 'Get My 20% Off Code'}
                  </button>
                </form>

                {/* Trust Signals */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    🔒 Your email is safe with us. We'll only send you exclusive offers.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Success State */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-[#18448D] mb-2">
                    Your Code is Ready!
                  </h2>
                  <p className="text-gray-600 mb-6">
                    We've also sent it to <strong>{email}</strong>
                  </p>

                  {/* Code Display */}
                  <div className="bg-gradient-to-br from-[#18448D]/10 to-[#18448D]/5 border-2 border-[#18448D] rounded-xl p-6 mb-6">
                    <p className="text-sm text-gray-600 mb-2">Your Discount Code</p>
                    <p className="text-3xl font-bold text-[#18448D] tracking-wider mb-4">
                      {generatedCode}
                    </p>
                    <p className="text-sm text-gray-500">
                      20% off • Valid for 14 days • One-time use
                    </p>
                  </div>

                  {/* Copy Button */}
                  <button
                    onClick={handleCopyCode}
                    className="w-full bg-[#ff6b35] hover:bg-[#f7931e] text-white font-semibold py-3 px-6 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="w-5 h-5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        Copy Code
                      </>
                    )}
                  </button>

                  {/* Fine Print */}
                  <p className="text-xs text-gray-500 mt-6">
                    Code expires in 14 days. Check your email for details.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
