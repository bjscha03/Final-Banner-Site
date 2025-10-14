
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import AIDesign from "./pages/AIDesign";
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
import AdminSeed from "./pages/AdminSeed";
import AdminSetup from "./pages/AdminSetup";
import LogoShowcase from "./pages/LogoShowcase";
import BannerDesignerTest from "./pages/BannerDesignerTest";
import { useCartSync } from "@/hooks/useCartSync";

// Wrapper to sync cart when user logs in
const CartSyncWrapper = ({ children }: { children: React.ReactNode }) => {
  useCartSync();
  return <>{children}</>;
};

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CartSyncWrapper>
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/design" element={<Design />} />
            <Route path="/ai-design" element={<AIDesign />} />
            <Route path="/about" element={<About />} />
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
            <Route path="/admin/seed" element={<AdminSeed />} />
            <Route path="/admin/setup" element={<AdminSetup />} />
            <Route path="/logo-showcase" element={<LogoShowcase />} />
            <Route path="/banner-designer-test" element={<BannerDesignerTest />} />
            <Route path="/pdf-diagnostic" element={<PdfDiagnostic />} />          </Routes>
          </BrowserRouter>
        </CartSyncWrapper>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
// DEPLOYMENT FORCE 1758771933
// DEPLOYMENT FORCE 1759253703
