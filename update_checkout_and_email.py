#!/usr/bin/env python3
import os

BASE_DIR = "/Users/brandonschaefer/Projects/Final-Banner-Site"

def update_checkout():
    """Update Checkout.tsx"""
    file_path = os.path.join(BASE_DIR, "src/pages/Checkout.tsx")
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Add import if not present
    if 'OrderItemBreakdown' not in content:
        old_import = "import { usd, formatDimensions, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';"
        new_import = """import { usd, formatDimensions, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import OrderItemBreakdown from '@/components/orders/OrderItemBreakdown';"""
        content = content.replace(old_import, new_import)
    
    # Replace breakdown section - look for the specific pattern
    if '<h4 className="text-sm font-medium text-gray-900 mb-2">Price Breakdown</h4>' in content:
        # Find the breakdown div and replace it
        marker = '{/* Cost Breakdown */}'
        if marker in content:
            start_idx = content.find(marker)
            # Find the closing </div> for this section (3 levels deep)
            temp = content[start_idx:]
            div_count = 0
            end_offset = 0
            for i in range(len(temp)):
                if temp[i:i+4] == '<div':
                    div_count += 1
                elif temp[i:i+6] == '</div>':
                    div_count -= 1
                    if div_count == -1:  # Found the closing div
                        end_offset = i + 6
                        break
            
            if end_offset > 0:
                new_breakdown = '{/* Cost Breakdown - Using Unified Pricing Module */}\n                          <OrderItemBreakdown item={item} variant="compact" />'
                content = content[:start_idx] + new_breakdown + content[start_idx + end_offset:]
    
    with open(file_path, 'w') as f:
        f.write(content)
    
    print(f"✅ Updated {file_path}")

def update_email():
    """Update OrderConfirmation.tsx email template"""
    file_path = os.path.join(BASE_DIR, "src/emails/OrderConfirmation.tsx")
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Add import
    if 'OrderItemBreakdownEmail' not in content:
        # Add after the React Email imports
        import_marker = "} from '@react-email/components';"
        new_import = """} from '@react-email/components';
import OrderItemBreakdownEmail from '@/components/orders/OrderItemBreakdownEmail';"""
        content = content.replace(import_marker, new_import)
    
    # Replace the breakdown section in email
    if 'hasBreakdown && (' in content:
        # Find and replace the cost breakdown div
        start_marker = '{/* Cost Breakdown - only show if we have the data */}'
        if start_marker in content:
            start_idx = content.find(start_marker)
            # Find the closing div
            temp = content[start_idx:]
            div_count = 0
            end_offset = 0
            for i in range(len(temp)):
                if temp[i:i+4] == '<div' or temp[i:i+4] == '<Tex':
                    div_count += 1
                elif temp[i:i+6] == '</div>' or temp[i:i+7] == '</Text>':
                    div_count -= 1
                    if div_count == -1:
                        end_offset = i + 6
                        break
            
            if end_offset > 0:
                new_breakdown = '{/* Cost Breakdown - Using Unified Pricing Module */}\n                        <OrderItemBreakdownEmail item={item} />'
                content = content[:start_idx] + new_breakdown + content[start_idx + end_offset:]
    
    with open(file_path, 'w') as f:
        f.write(content)
    
    print(f"✅ Updated {file_path}")

def main():
    print("🚀 Updating Checkout and Email templates...\n")
    
    try:
        update_checkout()
        update_email()
        
        print("\n✅ All updates complete!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
