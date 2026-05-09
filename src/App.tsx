import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/theme-provider";
import { useCartSync } from "@/hooks/useCartSync";
import { useCartRevalidation } from "@/hooks/useCartRevalidation";
import { useCartStore } from "@/store/cart";
import { toast } from "@/components/ui/use-toast";
import { initPostHog } from "@/lib/posthog";
// DISABLED: Popup promo flow replaced with static NEW20 code in PromoBanner
// import { PromoPopup } from "@/components/PromoPopup";
// import { usePromoPopup } from "@/hooks/usePromoPopup";

// Critical path - load immediately for homepage
import Index from "./pages/Index";


const CHUNK_RELOAD_KEY = 'vite_chunk_reload_once';

function installChunkLoadRecovery() {
  if (typeof window === 'undefined') return;

  const shouldHandle = (message: string) => {
    const m = message.toLowerCase();
    return m.includes('failed to fetch dynamically imported module') ||
      m.includes('importing a module script failed') ||
      m.includes('loading chunk') ||
      m.includes('chunkloaderror');
  };

  const recover = (raw: unknown) => {
    const msg = String(raw || '');
    if (!shouldHandle(msg)) return;
    const reloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
    if (reloaded) {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return;
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  };

  window.addEventListener('error', (event) => recover(event.message || (event.error && event.error.message)));
  window.addEventListener('unhandledrejection', (event) => recover((event.reason && event.reason.message) || event.reason));
}

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-pulse text-lg text-gray-500">Loading...</div>
  </div>
);

// Lazy load non-critical routes
const Design = lazy(() => import("./pages/Design"));
// DesignEditor route removed — redirects to /design
const DesignComplete = lazy(() => import("./pages/DesignComplete"));
const CanvaEditor = lazy(() => import("./pages/CanvaEditor"));
const CanvaTest = lazy(() => import("./pages/CanvaTest"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const MyAIImages = lazy(() => import("./pages/MyAIImages"));

// Auth pages - lazy load
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail").then(m => ({ default: m.VerifyEmail })));
const CheckEmail = lazy(() => import("./pages/CheckEmail"));

// Static pages - lazy load
const About = lazy(() => import("./pages/About"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Contact = lazy(() => import("./pages/Contact"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Shipping = lazy(() => import("./pages/Shipping"));

// Blog pages - lazy load
const Blog = lazy(() => import("./pages/Blog"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const BlogTagPage = lazy(() => import("./pages/BlogTagPage"));

// Event Discovery page - lazy load
const EventDiscovery = lazy(() => import("./pages/EventDiscovery"));

// Category/SEO pages - lazy load
const CategoryPage = lazy(() => import("./pages/CategoryPage"));

// Google Ads landing page - lazy load
const GoogleAdsBanner = lazy(() => import("./pages/GoogleAdsBanner"));

// Programmatic SEO city × product landing pages - lazy load
const CityProductPage = lazy(() => import("./pages/CityProductPage"));

// Graduation landing page - lazy load
const GraduationSigns = lazy(() => import("./pages/GraduationSigns"));
const PoliticalSigns = lazy(() => import("./pages/PoliticalSigns"));
const GraduationSignsThankYou = lazy(() => import("./pages/GraduationSignsThankYou"));

// Admin pages - lazy load (heavy, rarely accessed)
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminAbandonedCarts = lazy(() => import("./pages/admin/AbandonedCarts"));
const AdminEvents = lazy(() => import("./pages/admin/Events"));
const AdminGraduationIntakes = lazy(() => import("./pages/admin/GraduationIntakes"));
const AdminGraduationIntake = lazy(() => import("./pages/admin/GraduationIntake"));
const ProofApproval = lazy(() => import("./pages/ProofApproval"));
const AdminSeed = lazy(() => import("./pages/AdminSeed"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));

// Utility/debug pages - lazy load
const LogoShowcase = lazy(() => import("./pages/LogoShowcase"));
const PdfDiagnostic = lazy(() => import("./pages/PdfDiagnostic"));

// 404 page
const NotFound = lazy(() => import("./pages/NotFound"));

// Wrapper to sync cart when user logs in and enable cross-device revalidation
const CartSyncWrapper = ({ children }: { children: React.ReactNode }) => {
  useCartSync();
  const location = useLocation();
  
  // Enable cross-device cart revalidation
  useCartRevalidation({
    onFocus: true,        // Revalidate when tab gains focus
    onReconnect: true,    // Revalidate when network reconnects
    pollingInterval: 0,   // Disable periodic polling (set to 30000 for 30s polling)
    debounceMs: 1000,     // Debounce revalidation calls
  });

  // Initialize PostHog once
  useEffect(() => {
    initPostHog();
  }, []);

  // Same-Day Hit Service: 60s ticker. If the ET cutoff passes mid-session,
  // automatically clear the cart flags and surface a one-time toast so the
  // customer doesn't try to check out with an option we can no longer honor.
  const reconcileSameDayHitService = useCartStore((s) => s.reconcileSameDayHitService);
  useEffect(() => {
    const id = setInterval(() => {
      const result = reconcileSameDayHitService();
      if (result.cleared && result.reason === 'window_closed') {
        toast({
          title: 'Same-Day Hit Service removed',
          description: 'Same-Day Hit Service is no longer available for today’s production window.',
        });
      }
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [reconcileSameDayHitService]);

  // DISABLED: Popup promo flow replaced with static NEW20 code in PromoBanner
  // The PromoBanner now shows "New Customers: 20% OFF with code NEW20" with click-to-copy
  // Server-side validation in validate-discount-code.cjs enforces first-order-only

  return (
    <>
      {children}
    </>
  );
};

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    installChunkLoadRecovery();
  }, []);

  return (
  <HelmetProvider>
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <CartSyncWrapper>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Critical path - homepage */}
            <Route path="/" element={<Index />} />
            
            {/* Design routes */}
            <Route path="/design" element={<Design />} />
            {/* Legacy design-editor route — redirect to /design to prevent old designer page from loading */}
            <Route path="/design-editor" element={<Navigate to="/design" replace />} />
            <Route path="/halloween-banner" element={<Design />} />
            <Route path="/design/complete" element={<DesignComplete />} />
            <Route path="/design/canva-editor" element={<CanvaEditor />} />
            <Route path="/canva-test" element={<CanvaTest />} />
            
            {/* Checkout flow */}
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/order-confirmation" element={<OrderConfirmation />} />
            
            {/* User account */}
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/my-ai-images" element={<MyAIImages />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            
            {/* Auth routes */}
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/check-email" element={<CheckEmail />} />
            
            {/* Static pages */}
            <Route path="/faq" element={<FAQ />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/shipping" element={<Shipping />} />
            
            {/* Blog */}
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/blog/tags/:tag" element={<BlogTagPage />} />
            
            {/* Event Discovery */}
            <Route path="/events" element={<EventDiscovery />} />
            
            {/* Admin routes */}
            <Route path="/admin" element={<Navigate to="/admin/orders" replace />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/abandoned-carts" element={<AdminAbandonedCarts />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/graduation-intakes" element={<AdminGraduationIntakes />} />
            <Route path="/admin/graduation/:intakeId" element={<AdminGraduationIntake />} />
            <Route path="/admin/seed" element={<AdminSeed />} />
            <Route path="/admin/setup" element={<AdminSetup />} />
            
            {/* Utility pages */}
            <Route path="/logo-showcase" element={<LogoShowcase />} />
            <Route path="/pdf-diagnostic" element={<PdfDiagnostic />} />
            
            {/* SEO Category Pages */}
            <Route path="/vinyl-banners" element={<CategoryPage />} />
            <Route path="/mesh-banners" element={<CategoryPage />} />
            <Route path="/trade-show-banners" element={<CategoryPage />} />
            <Route path="/food-truck-banners" element={<CategoryPage />} />
            <Route path="/outdoor-banners" element={<CategoryPage />} />
            <Route path="/indoor-banners" element={<CategoryPage />} />
            <Route path="/event-banners" element={<CategoryPage />} />
            <Route path="/custom-banners" element={<CategoryPage />} />
            <Route path="/construction-banners" element={<CategoryPage />} />

            {/* Google Ads landing page */}
            <Route path="/google-ads-banner" element={<GoogleAdsBanner />} />

            {/* Programmatic SEO city pages (vinyl banners, yard signs, car magnets) */}
            <Route path="/vinyl-banners/:citySlug" element={<CityProductPage productSlug="vinyl-banners" />} />
            <Route path="/yard-signs/:citySlug" element={<CityProductPage productSlug="yard-signs" />} />
            <Route path="/car-magnets/:citySlug" element={<CityProductPage productSlug="car-magnets" />} />

            {/* Graduation landing page */}
            <Route path="/graduation-signs" element={<GraduationSigns />} />
            <Route path="/political-signs" element={<PoliticalSigns />} />
            <Route path="/graduation-signs/thank-you" element={<GraduationSignsThankYou />} />

            {/* Customer-facing graduation proof approval (token-gated) */}
            <Route path="/proof/:token" element={<ProofApproval />} />

            {/* 404 – catch-all must be last */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </CartSyncWrapper>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </HelmetProvider>
  );
};

export default App;
