import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/theme-provider";
import { useCartSync } from "@/hooks/useCartSync";
import { useCartRevalidation } from "@/hooks/useCartRevalidation";
import { initPostHog } from "@/lib/posthog";
import { PromoPopup } from "@/components/PromoPopup";
import { usePromoPopup } from "@/hooks/usePromoPopup";

// Critical path - load immediately for homepage
import Index from "./pages/Index";

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-pulse text-lg text-gray-500">Loading...</div>
  </div>
);

// Lazy load non-critical routes
const Design = lazy(() => import("./pages/Design"));
const DesignEditor = lazy(() => import("./pages/DesignEditor"));
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

// Events pages - lazy load
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const EventSubmit = lazy(() => import("./pages/EventSubmit"));

// Category/SEO pages - lazy load
const CategoryPage = lazy(() => import("./pages/CategoryPage"));

// Admin pages - lazy load (heavy, rarely accessed)
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminEvents = lazy(() => import("./pages/admin/Events"));
const AdminAbandonedCarts = lazy(() => import("./pages/admin/AbandonedCarts"));
const AdminSeed = lazy(() => import("./pages/AdminSeed"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));

// Utility/debug pages - lazy load
const LogoShowcase = lazy(() => import("./pages/LogoShowcase"));
const BannerDesignerTest = lazy(() => import("./pages/BannerDesignerTest"));
const PdfDiagnostic = lazy(() => import("./pages/PdfDiagnostic"));

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

  // Promo popup logic - only show on homepage
  const isHomepage = location.pathname === '/';
  const { showPopup, popupSource, closePopup } = usePromoPopup({
    delaySeconds: 11, // Show popup after 11 seconds
    enableExitIntent: true,
  });
  
  return (
    <>
      {children}
      {isHomepage && showPopup && <PromoPopup onClose={closePopup} source={popupSource} />}
    </>
  );
};

const queryClient = new QueryClient();

const App = () => (
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
            <Route path="/design-editor" element={<DesignEditor />} />
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
            
            {/* Events */}
            <Route path="/events" element={<Events />} />
            <Route path="/events/:slug" element={<EventDetail />} />
            <Route path="/events/submit" element={<EventSubmit />} />
            
            {/* Admin routes */}
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/abandoned-carts" element={<AdminAbandonedCarts />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/seed" element={<AdminSeed />} />
            <Route path="/admin/setup" element={<AdminSetup />} />
            
            {/* Utility pages */}
            <Route path="/logo-showcase" element={<LogoShowcase />} />
            <Route path="/banner-designer-test" element={<BannerDesignerTest />} />
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
          </Routes>
          </Suspense>
          </CartSyncWrapper>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </HelmetProvider>
);

export default App;
