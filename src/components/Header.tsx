import React, { useState } from 'react';
import { ShoppingCart, Menu, X, User, LogOut, Package, Shield, HelpCircle } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ScrollToTopLink from './ScrollToTopLink';
import Logo from './Logo';
import { useAuth, isAdmin } from '@/lib/auth';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  cartCount?: number;
  onCartClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ cartCount = 0, onCartClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const navItems = [
    { name: 'Home', href: '/' },
    { name: 'Blog', href: '/blog' },
    { name: 'Design Tool', href: '/design' },
    { name: 'About', href: '/about' },
    { name: 'FAQ', href: '/faq' },
    { name: 'Contact', href: '/contact' }
  ];

  const handleSignOut = async () => {
    try {
      await signOut();

      toast({
        title: 'Signed out successfully',
        description: 'You have been signed out of your account.',
      });

      navigate('/');
    } catch (error) {
      toast({
        title: 'Sign out failed',
        description: 'There was an error signing you out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Hamburger Menu (always visible, even on desktop) */}
          <div className="flex items-center w-24">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-slate-600 hover:text-slate-900 transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Center: Logo */}
          <div className="flex-shrink-0">
            <ScrollToTopLink to="/" className="flex items-center">
              <Logo variant="compact" height={48} className="h-12 object-contain" animated />
            </ScrollToTopLink>
          </div>

          {/* Right: Help, User, Cart Icons */}
          <div className="flex items-center justify-end w-24 gap-1">
            {/* Help Icon */}
            <ScrollToTopLink
              to="/faq"
              className="p-2 text-slate-500 hover:text-slate-700 transition-colors"
              aria-label="Help & FAQ"
            >
              <HelpCircle className="h-5 w-5" />
            </ScrollToTopLink>

            {/* User Icon / Dropdown */}
            {!loading && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-2 text-slate-500 hover:text-slate-700 transition-colors"
                    aria-label="Account"
                  >
                    <User className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {user ? (
                    <>
                      <DropdownMenuItem asChild>
                        <ScrollToTopLink to="/my-orders" className="flex items-center">
                          <Package className="h-4 w-4 mr-2" />
                          My Orders
                        </ScrollToTopLink>
                      </DropdownMenuItem>
                      {isAdmin(user) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <ScrollToTopLink to="/admin/orders" className="flex items-center">
                              <Shield className="h-4 w-4 mr-2" />
                              Admin: Orders
                            </ScrollToTopLink>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem asChild>
                        <ScrollToTopLink to="/sign-in" className="flex items-center">
                          <User className="h-4 w-4 mr-2" />
                          Sign In
                        </ScrollToTopLink>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <ScrollToTopLink to="/sign-up" className="flex items-center">
                          <User className="h-4 w-4 mr-2" />
                          Create Account
                        </ScrollToTopLink>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Cart Icon */}
            <button
              onClick={onCartClick}
              aria-label="Shopping cart"
              className="relative p-2 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-green-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Slide-out Navigation Menu (works on all screen sizes) */}
        {isMenuOpen && (
          <div className="absolute left-0 top-full w-64 bg-white shadow-lg border-r border-slate-200 z-50">
            <div className="py-2">
              {navItems.map((item) => (
                <ScrollToTopLink
                  key={item.name}
                  to={item.href}
                  className={`block px-4 py-3 text-sm font-medium border-b border-slate-100 ${
                    location.pathname === item.href
                      ? 'text-[#18448D] bg-blue-50'
                      : 'text-slate-700 hover:text-[#18448D] hover:bg-slate-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </ScrollToTopLink>
              ))}

              {/* Account section in menu */}
              <div className="border-t border-slate-200 mt-2 pt-2">
                {!loading && user && (
                  <>
                    <ScrollToTopLink
                      to="/my-orders"
                      className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:text-[#18448D] hover:bg-slate-50"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Package className="h-4 w-4" />
                      My Orders
                    </ScrollToTopLink>
                    {isAdmin(user) && (
                      <ScrollToTopLink
                        to="/admin/orders"
                        className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:text-[#18448D] hover:bg-slate-50"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <Shield className="h-4 w-4" />
                        Admin: Orders
                      </ScrollToTopLink>
                    )}
                    <button
                      onClick={() => {
                        handleSignOut();
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-slate-700 hover:text-[#18448D] hover:bg-slate-50 text-left"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;