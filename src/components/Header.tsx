import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Menu, X, User, LogOut, Package, Shield } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import ScrollToTopLink from './ScrollToTopLink';
import { useAuth, isAdmin } from '@/lib/auth';
import { useToast } from '@/components/ui/use-toast';
import { useDocumentScrollLock } from '@/hooks/useDocumentScrollLock';
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
  const menuRef = useRef<HTMLDivElement>(null);
  useDocumentScrollLock(isMenuOpen);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: 'Home', href: '/' },
    { name: 'Vinyl Banners', href: '/vinyl-banners' },
    { name: 'Yard Signs', href: '/yard-signs' },
    { name: 'Car Magnets', href: '/car-magnets' },
    { name: 'Shipping', href: '/shipping' },
    { name: 'Blog', href: '/blog' },
    { name: 'Design Tool', href: '/design' },
    { name: 'Request a Custom Quote', href: '/custom-quote' },
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
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-[0_4px_20px_rgba(11,31,58,0.04)] backdrop-blur">
      <div className="h-1 bg-[#FF6A00]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-[72px] items-center justify-between lg:h-[78px]">
          {/* Compact navigation for mobile and tablet */}
          <div className="flex items-center w-12 lg:hidden" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="min-h-11 min-w-11 rounded-md p-2 text-[#0B1F3A] transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
              aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            {/* Slide-out Navigation Menu (works on all screen sizes) */}
            {isMenuOpen && (
              <div data-mobile-navigation className="absolute left-0 top-full z-50 h-[calc(100dvh-76px)] w-[min(88vw,320px)] touch-pan-y overflow-y-auto overscroll-contain border-r border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[12px_18px_40px_rgba(11,31,58,0.16)] [-webkit-overflow-scrolling:touch]">
                <div className="py-2">
                  {navItems.map((item) => (
                    <ScrollToTopLink
                      key={item.name}
                      to={item.href}
                      className={`block border-b border-slate-100 px-5 py-3.5 text-sm font-semibold ${
                        location.pathname === item.href
                          ? 'border-l-4 border-l-[#FF6A00] bg-slate-50 text-[#0B1F3A]'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-[#0B1F3A]'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.name}
                    </ScrollToTopLink>
                  ))}

                  {/* Account section in menu */}
                  <div className="border-t border-slate-200 mt-2 pt-2">
                    {!loading && (
                      user ? (
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
                            <>
                              <ScrollToTopLink
                                to="/admin/orders"
                                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:text-[#18448D] hover:bg-slate-50"
                                onClick={() => setIsMenuOpen(false)}
                              >
                                <Shield className="h-4 w-4" />
                                Admin: Orders
                              </ScrollToTopLink>
                              <ScrollToTopLink
                                to="/admin/custom-quotes"
                                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:text-[#18448D] hover:bg-slate-50"
                                onClick={() => setIsMenuOpen(false)}
                              >
                                <Shield className="h-4 w-4" />
                                Admin: Custom Quotes
                              </ScrollToTopLink>
                            </>
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
                      ) : (
                        <>
                          <ScrollToTopLink
                            to="/sign-in"
                            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:text-[#18448D] hover:bg-slate-50"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            <User className="h-4 w-4" />
                            Sign In
                          </ScrollToTopLink>
                          <ScrollToTopLink
                            to="/sign-up"
                            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:text-[#18448D] hover:bg-slate-50"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            <User className="h-4 w-4" />
                            Create Account
                          </ScrollToTopLink>
                        </>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center: Logo */}
          <div className="flex-shrink-0">
            <ScrollToTopLink to="/" className="flex items-center">
              <img
                src="/images/header-logo.png"
                alt="Banners On The Fly"
                width="248"
                height="70"
                className="h-10 w-auto max-w-[205px] object-contain sm:h-12 sm:max-w-[250px]"
              />
            </ScrollToTopLink>
          </div>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
            {[
              { name: 'Vinyl Banners', href: '/vinyl-banners' },
              { name: 'Yard Signs', href: '/yard-signs' },
              { name: 'Car Magnets', href: '/car-magnets' },
              { name: 'Shipping', href: '/shipping' },
              { name: 'Custom Quote', href: '/custom-quote' },
            ].map((item) => (
              <ScrollToTopLink
                key={item.href}
                to={item.href}
                className={`relative py-2 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-left after:bg-[#FF6A00] after:transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] ${
                  location.pathname === item.href ? 'text-[#0B1F3A] after:scale-x-100' : 'text-slate-600 after:scale-x-0 hover:text-[#0B1F3A] hover:after:scale-x-100'
                }`}
              >
                {item.name}
              </ScrollToTopLink>
            ))}
          </nav>

          {/* Right: User, Cart Icons */}
          <div className="flex items-center justify-end gap-1 lg:w-auto lg:gap-2">
            <ScrollToTopLink
              to="/design"
                className="mr-1 hidden min-h-11 items-center rounded-md bg-[#C94E00] px-4 text-sm font-bold text-white transition-colors hover:bg-[#B84300] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-2 xl:inline-flex"
            >
              Start designing
            </ScrollToTopLink>
            {/* User Icon / Dropdown */}
            {!loading && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="min-h-11 min-w-11 rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0B1F3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
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
                          <DropdownMenuItem asChild>
                            <ScrollToTopLink to="/admin/custom-quotes" className="flex items-center">
                              <Shield className="h-4 w-4 mr-2" />
                              Admin: Custom Quotes
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
              className="relative min-h-11 min-w-11 rounded-md p-2 text-[#0B1F3A] transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C94E00] px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
