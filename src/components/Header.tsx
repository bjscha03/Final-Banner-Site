import React, { useState } from 'react';
import { ShoppingCart, Menu, X, User, LogOut, Package, Shield, Sparkles } from 'lucide-react';
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
import { Button } from '@/components/ui/button';

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
    <header className="bg-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex md:justify-between justify-center items-center gap-3 h-16 relative">
          {/* Logo */}
          <div className="flex-shrink-0 md:static absolute left-1/2 md:left-auto -translate-x-1/2 md:translate-x-0">
            <ScrollToTopLink to="/" className="flex items-center">
              <Logo variant="compact" height={56} className="h-14 max-w-[320px] object-contain" animated />
            </ScrollToTopLink>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  location.pathname === item.href
                    ? 'text-blue-700 border-b-2 border-blue-700'
                    : 'text-gray-700 hover:text-blue-700'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-4 md:static absolute right-4">
            <button
              onClick={onCartClick}
              className="relative p-2 text-gray-700 hover:text-blue-700 transition-colors"
            >
              <ShoppingCart className="h-6 w-6" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            {!loading && (
              <>
                {user ? (
                  // Authenticated user menu
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="hidden md:flex items-center space-x-2">
                        <User className="h-5 w-5" />
                        <span className="text-sm font-medium">
                          {user.email?.split('@')[0] || 'Account'}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <ScrollToTopLink to="/my-orders" className="flex items-center">
                          <Package className="h-4 w-4 mr-2" />
                          My Orders
                        </ScrollToTopLink>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <ScrollToTopLink to="/my-ai-images" className="flex items-center">
                          <Sparkles className="h-4 w-4 mr-2" />
                          My AI Images
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  // Unauthenticated user buttons
                  <>
                    <Button
                      variant="ghost"
                      asChild
                      className="hidden md:flex items-center space-x-2"
                    >
                      <ScrollToTopLink to="/sign-in">
                        <User className="h-5 w-5" />
                        <span className="text-sm font-medium">Sign In</span>
                      </ScrollToTopLink>
                    </Button>

                    <Button asChild className="hidden md:block">
                      <ScrollToTopLink to="/sign-up">Get Started</ScrollToTopLink>
                    </Button>
                  </>
                )}
              </>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-gray-700"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-gray-50">
              {navItems.map((item) => (
                <ScrollToTopLink
                  key={item.name}
                  to={item.href}
                  className={`block px-3 py-2 text-base font-medium ${
                    location.pathname === item.href
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-gray-700 hover:text-blue-700'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </ScrollToTopLink>
              ))}
              <div className="border-t pt-3 mt-3">
                {!loading && (
                  <>
                    {user ? (
                      // Authenticated mobile menu
                      <>
                        <ScrollToTopLink
                          to="/my-orders"
                          className="flex items-center space-x-2 text-gray-700 hover:text-blue-700 w-full px-3 py-2 text-base font-medium"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <Package className="h-5 w-5" />
                          <span>My Orders</span>
                        </ScrollToTopLink>
                        <ScrollToTopLink
                          to="/my-ai-images"
                          className="flex items-center space-x-2 text-gray-700 hover:text-blue-700 w-full px-3 py-2 text-base font-medium"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <Sparkles className="h-5 w-5" />
                          <span>My AI Images</span>
                        </ScrollToTopLink>
                        {isAdmin(user) && (
                          <ScrollToTopLink
                            to="/admin/orders"
                            className="flex items-center space-x-2 text-gray-700 hover:text-blue-700 w-full px-3 py-2 text-base font-medium"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            <Shield className="h-5 w-5" />
                            <span>Admin: Orders</span>
                          </ScrollToTopLink>
                        )}
                        <button
                          onClick={() => {
                            handleSignOut();
                            setIsMenuOpen(false);
                          }}
                          className="flex items-center space-x-2 text-gray-700 hover:text-blue-700 w-full px-3 py-2 text-base font-medium"
                        >
                          <LogOut className="h-5 w-5" />
                          <span>Sign Out</span>
                        </button>
                      </>
                    ) : (
                      // Unauthenticated mobile menu
                      <>
                        <ScrollToTopLink
                          to="/sign-in"
                          className="flex items-center space-x-2 text-gray-700 hover:text-blue-700 w-full px-3 py-2 text-base font-medium"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <User className="h-5 w-5" />
                          <span>Sign In</span>
                        </ScrollToTopLink>
                        <ScrollToTopLink
                          to="/sign-up"
                          className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-medium transition-colors block text-center"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          Get Started
                        </ScrollToTopLink>
                      </>
                    )}
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