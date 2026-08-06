import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProviders } from "@/components/AppProviders";
import { useCartSync } from "@/hooks/useCartSync";
import { useCartRevalidation } from "@/hooks/useCartRevalidation";
import { useCartStore } from "@/store/cart";
import { toast } from "@/components/ui/use-toast";
import { captureAttributionFromLocation } from "@/lib/attribution";
import AnalyticsController from "@/components/AnalyticsController";
import RouteRobotsPolicy from "@/components/RouteRobotsPolicy";
import CityProductPage from "./pages/CityProductPage";
import ProductHubPage from "./pages/ProductHubPage";
import TradeShowDirectory from "./pages/TradeShowDirectory";
import TradeShowDetail from "./pages/TradeShowDetail";
import NotFound from "./pages/NotFound";
// DISABLED: Popup promo flow replaced with static NEW20 code in PromoBanner
// import { PromoPopup } from "@/components/PromoPopup";
// import { usePromoPopup } from "@/hooks/usePromoPopup";

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
const CustomQuote = lazy(() => import("./pages/CustomQuote"));

// Blog pages - lazy load
const Blog = lazy(() => import("./pages/Blog"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const BlogTagPage = lazy(() => import("./pages/BlogTagPage"));

// Category/SEO pages - lazy load
const CategoryPage = lazy(() => import("./pages/CategoryPage"));

// Google Ads landing page - lazy load
const GoogleAdsBanner = lazy(() => import("./pages/GoogleAdsBanner"));

const PoliticalSigns = lazy(() => import("./pages/PoliticalSigns"));

// Admin pages - lazy load (heavy, rarely accessed)
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminAbandonedCarts = lazy(() => import("./pages/admin/AbandonedCarts"));
const AdminCustomQuotes = lazy(() => import("./pages/admin/CustomQuotes"));
const AdminEmailTemplates = lazy(() => import("./pages/admin/EmailTemplates"));
const PayPalReconciliation = lazy(() => import("./pages/admin/PayPalReconciliation"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));
const AIDesignerPage = lazy(() => import("./pages/admin/AIDesignerPage"));
const AdminSalesShell = lazy(() => import("./pages/admin/sales/SalesShell"));
const AdminSalesDashboard = lazy(() => import("./pages/admin/sales/SalesDashboard"));
const AdminSalesSettings = lazy(() => import("./pages/admin/sales/SalesSettings"));
const AdminSalesProspects = lazy(() => import("./pages/admin/sales/SalesProspects"));
const AdminSalesActivity = lazy(() => import("./pages/admin/sales/SalesActivity"));
const AdminSalesCosts = lazy(() => import("./pages/admin/sales/SalesCosts"));
const AdminSalesReplies = lazy(() => import("./pages/admin/sales/SalesReplies"));
const AdminSalesOrders = lazy(() => import("./pages/admin/sales/SalesOrders"));
const AdminSalesPerformance = lazy(() => import("./pages/admin/sales/SalesPerformance"));
const AdminSalesErrors = lazy(() => import("./pages/admin/sales/SalesErrors"));

// Utility/debug pages - lazy load
const LogoShowcase = lazy(() => import("./pages/LogoShowcase"));
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

const AttributionCapture = () => {
  const location = useLocation();
  useEffect(() => {
    captureAttributionFromLocation();
  }, [location.search]);
  return null;
};

/** Router-dependent application tree shared by BrowserRouter and StaticRouter. */
export const RoutedApplication = () => (
        <CartSyncWrapper>
          <AttributionCapture />
          <AnalyticsController />
          <RouteRobotsPolicy />
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
            <Route path="/custom-quote" element={<CustomQuote />} />
            
            {/* Blog */}
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/blog/tags/:tag" element={<BlogTagPage />} />
            
            {/* Admin routes */}
            <Route path="/admin" element={<Navigate to="/admin/orders" replace />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/abandoned-carts" element={<AdminAbandonedCarts />} />
            <Route path="/admin/custom-quotes" element={<AdminCustomQuotes />} />
            <Route path="/admin/email-templates" element={<AdminEmailTemplates />} />
            <Route path="/admin/email-templates/:slug" element={<AdminEmailTemplates />} />
            <Route path="/admin/paypal-reconciliation" element={<PayPalReconciliation />} />
            {/* Admin login / setup page — password gate that grants admin access */}
            <Route path="/admin/setup" element={<AdminSetup />} />
            <Route path="/admin/ai-designer" element={<AIDesignerPage />} />
            <Route path="/admin/sales" element={<AdminSalesShell />}>
              <Route index element={<AdminSalesDashboard />} />
              <Route path="dashboard" element={<Navigate to="/admin/sales" replace />} />
              <Route path="prospects" element={<AdminSalesProspects />} />
              <Route path="activity" element={<AdminSalesActivity />} />
              <Route path="replies" element={<AdminSalesReplies />} />
              <Route path="orders" element={<AdminSalesOrders />} />
              <Route path="performance" element={<AdminSalesPerformance />} />
              <Route path="costs" element={<AdminSalesCosts />} />
              <Route path="errors" element={<AdminSalesErrors />} />
              <Route path="settings" element={<AdminSalesSettings />} />
            </Route>
            {/* Legacy dev placeholder routes — redirect any deep links to the real admin entry */}
            <Route path="/admin/seed" element={<Navigate to="/admin/orders" replace />} />
            
            {/* Utility pages */}
            <Route path="/logo-showcase" element={<LogoShowcase />} />
            <Route path="/pdf-diagnostic" element={<PdfDiagnostic />} />
            
            {/* SEO Category Pages */}
            <Route path="/vinyl-banners" element={<ProductHubPage productSlug="vinyl-banners" />} />
            <Route path="/yard-signs" element={<ProductHubPage productSlug="yard-signs" />} />
            <Route path="/car-magnets" element={<ProductHubPage productSlug="car-magnets" />} />
            <Route path="/mesh-banners" element={<CategoryPage />} />
            <Route path="/trade-show-banners" element={<CategoryPage />} />
            <Route path="/food-truck-banners" element={<CategoryPage />} />
            <Route path="/outdoor-banners" element={<CategoryPage />} />
            <Route path="/indoor-banners" element={<CategoryPage />} />
            <Route path="/event-banners" element={<CategoryPage />} />
            <Route path="/custom-banners" element={<CategoryPage />} />
            <Route path="/construction-banners" element={<CategoryPage />} />

            {/* Searchable trade show calendar and event-specific exhibitor planners */}
            <Route path="/trade-shows" element={<TradeShowDirectory />} />
            <Route path="/trade-shows/:slug" element={<TradeShowDetail />} />

            {/* Google Ads landing page */}
            <Route path="/google-ads-banner" element={<GoogleAdsBanner />} />

            {/* Programmatic SEO city pages (vinyl banners, yard signs, car magnets) */}
            <Route path="/vinyl-banners/:citySlug" element={<CityProductPage productSlug="vinyl-banners" />} />
            <Route path="/yard-signs/:citySlug" element={<CityProductPage productSlug="yard-signs" />} />
            <Route path="/car-magnets/:citySlug" element={<CityProductPage productSlug="car-magnets" />} />

            <Route path="/political-signs" element={<PoliticalSigns />} />

            {/* 404 – catch-all must be last */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </CartSyncWrapper>
);

const App = () => (
  <AppProviders>
        <BrowserRouter>
          <RoutedApplication />
        </BrowserRouter>
  </AppProviders>
);

export default App;
