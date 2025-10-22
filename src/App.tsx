
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import DesignComplete from "./pages/DesignComplete";
import Design from "./pages/Design";
import About from "./pages/About";
import FAQ from "./pages/FAQ";
import Contact from "./pages/Contact";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Shipping from "./pages/Shipping";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { VerifyEmail } from "./pages/VerifyEmail";
import CheckEmail from "./pages/CheckEmail";
import MyOrders from "./pages/MyOrders";
import MyAIImages from "./pages/MyAIImages";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import PdfDiagnostic from "./pages/PdfDiagnostic";import PaymentSuccess from "./pages/PaymentSuccess";
import OrderDetail from "./pages/OrderDetail";
import AdminOrders from "./pages/admin/Orders";
import AdminEvents from "./pages/admin/Events";
import AdminAbandonedCarts from "./pages/admin/AbandonedCarts";
import AdminSeed from "./pages/AdminSeed";
import AdminSetup from "./pages/AdminSetup";
import LogoShowcase from "./pages/LogoShowcase";
import BannerDesignerTest from "./pages/BannerDesignerTest";
import Blog from "./pages/Blog";
import BlogPostPage from "./pages/BlogPostPage";
import BlogTagPage from "./pages/BlogTagPage";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import EventSubmit from "./pages/EventSubmit";
import CategoryPage from "./pages/CategoryPage";
import CanvaEditor from "./pages/CanvaEditor";
import CanvaTest from "./pages/CanvaTest";
import { useCartSync } from "@/hooks/useCartSync";
import { useCartRevalidation } from "@/hooks/useCartRevalidation";

// Wrapper to sync cart when user logs in and enable cross-device revalidation
const CartSyncWrapper = ({ children }: { children: React.ReactNode }) => {
  useCartSync();
  
  // Enable cross-device cart revalidation
  useCartRevalidation({
    onFocus: true,        // Revalidate when tab gains focus
    onReconnect: true,    // Revalidate when network reconnects
    pollingInterval: 0,   // Disable periodic polling (set to 30000 for 30s polling)
    debounceMs: 1000,     // Debounce revalidation calls
  });
  
  return <>{children}</>;
};

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CartSyncWrapper>
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/design" element={<Design />} />            <Route path="/about" element={<About />} />
            <Route path="/design/complete" element={<DesignComplete />} />
            <Route path="/design/canva-editor" element={<CanvaEditor />} />
            <Route path="/canva-test" element={<CanvaTest />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/shipping" element={<Shipping />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/check-email" element={<CheckEmail />} />
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/my-ai-images" element={<MyAIImages />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/order-confirmation" element={<OrderConfirmation />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/abandoned-carts" element={<AdminAbandonedCarts />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/seed" element={<AdminSeed />} />
            <Route path="/admin/setup" element={<AdminSetup />} />
            <Route path="/logo-showcase" element={<LogoShowcase />} />
            <Route path="/banner-designer-test" element={<BannerDesignerTest />} />
            <Route path="/pdf-diagnostic" element={<PdfDiagnostic />} />            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/blog/tags/:tag" element={<BlogTagPage />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:slug" element={<EventDetail />} />
            <Route path="/events/submit" element={<EventSubmit />} />            
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
          </BrowserRouter>
        </CartSyncWrapper>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </HelmetProvider>
);

export default App;
// DEPLOYMENT FORCE 1758771933
// DEPLOYMENT FORCE 1759253703
