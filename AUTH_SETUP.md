# Authentication System Setup Guide

## Overview

This guide will help you set up the complete authentication system for Banners On The Fly, including user management, order tracking, and admin functionality.

## Prerequisites

- Supabase account and project
- Node.js and npm installed
- Access to your Supabase project dashboard

## 1. Database Setup

### Step 1: Run Database Schema

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Copy and paste the contents of `database-schema.sql`
4. Click "Run" to execute the schema

This will create:
- `profiles` table for user information
- `orders` table for order tracking
- `order_items` table for order line items
- Row Level Security (RLS) policies
- Necessary indexes and triggers

### Step 2: Configure Authentication

1. In Supabase Dashboard, go to Authentication > Settings
2. Enable email confirmation (recommended)
3. Configure email templates if desired
4. Set up any additional auth providers if needed

## 2. Environment Variables

Create a `.env.local` file in your project root with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Admin Seeding (for initial setup only)
VITE_ADMIN_EMAIL=admin@yourcompany.com
VITE_ADMIN_PASSWORD=your_secure_admin_password
```

**Important**: 
- Never commit the service role key to version control
- Use strong passwords for admin accounts
- Remove admin credentials from environment after initial setup

## 3. Install Dependencies

The following dependencies have been added to the project:

```bash
npm install @supabase/supabase-js react-hook-form @hookform/resolvers zod date-fns
```

## 4. Initial Admin Setup

### Step 1: Access Admin Seeding Page

1. Start your development server: `npm run dev`
2. Navigate to `/admin/seed`
3. Enter the seed token: `banners-on-the-fly-admin-seed-2024`
4. Click "Seed Admin User & Sample Data"

This will:
- Create an admin user with the credentials from your environment variables
- Create sample orders for testing
- Set up the admin profile with `is_admin: true`

### Step 2: Remove Admin Route (Security)

After successful setup, you should:
1. Remove or comment out the admin seed route in `src/App.tsx`
2. Delete the `src/pages/AdminSeed.tsx` file
3. Remove admin credentials from environment variables

## 5. Features Overview

### Authentication Features

- **Sign Up**: Email/password registration with validation
- **Sign In**: Email/password authentication
- **Password Reset**: Email-based password recovery
- **Auto-redirect**: Redirects to intended pages after authentication
- **Session Management**: Automatic session handling with Supabase

### User Dashboard Features

- **My Orders Page**: View all user orders with search and filtering
- **Order Details**: Detailed view of individual orders
- **Reorder Functionality**: One-click reorder to cart
- **Responsive Design**: Works on all screen sizes

### Security Features

- **Row Level Security (RLS)**: Users can only access their own data
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Comprehensive form validation with Zod
- **CSRF Protection**: Built-in protection with Supabase

## 6. File Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── SignInForm.tsx      # Sign-in form component
│   │   └── SignUpForm.tsx      # Sign-up form component
│   ├── orders/
│   │   ├── OrdersTable.tsx     # Orders table with search/filter
│   │   ├── OrderRow.tsx        # Individual order row
│   │   └── OrderDetailsSheet.tsx # Order details modal
│   └── Header.tsx              # Updated with auth integration
├── pages/
│   ├── SignIn.tsx              # Sign-in page
│   ├── SignUp.tsx              # Sign-up page
│   ├── MyOrders.tsx            # User orders dashboard
│   └── AdminSeed.tsx           # Admin seeding (remove after setup)
├── lib/
│   ├── supabase/
│   │   └── client.ts           # Supabase client configuration
│   ├── date.ts                 # Date formatting utilities
│   └── admin/
│       └── seed.ts             # Admin seeding functions
└── store/
    └── cart.ts                 # Updated cart store (existing)
```

## 7. Testing the System

### Test User Registration

1. Go to `/sign-up`
2. Create a new account
3. Check email for verification (if enabled)
4. Sign in at `/sign-in`

### Test Order Management

1. Sign in as a user
2. Go to `/my-orders`
3. View sample orders (if admin seeding was run)
4. Test search and filtering functionality
5. Click "View" to see order details
6. Test "Reorder" functionality

### Test Authentication Flow

1. Try accessing `/my-orders` without being signed in
2. Should redirect to `/sign-in?next=/my-orders`
3. After signing in, should redirect back to `/my-orders`

## 8. Production Deployment

### Security Checklist

- [ ] Remove admin seeding route and files
- [ ] Remove admin credentials from environment variables
- [ ] Verify RLS policies are working correctly
- [ ] Test authentication flow end-to-end
- [ ] Ensure HTTPS is enabled
- [ ] Configure proper CORS settings in Supabase
- [ ] Set up monitoring and error tracking

### Environment Variables for Production

```env
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
# Do NOT include service role key in production client
```

## 9. Troubleshooting

### Common Issues

1. **"Invalid JWT" errors**: Check that your Supabase URL and anon key are correct
2. **RLS policy errors**: Verify that policies are set up correctly in Supabase
3. **Email not sending**: Check Supabase email settings and templates
4. **Orders not showing**: Verify user_id is correctly set in orders table

### Debug Mode

Add this to your environment for debugging:

```env
VITE_DEBUG_AUTH=true
```

This will enable additional console logging for authentication events.

## Support

For issues with this authentication system:
1. Check the browser console for errors
2. Verify Supabase configuration
3. Test database policies in Supabase dashboard
4. Review the troubleshooting section above
