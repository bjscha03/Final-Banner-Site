#!/usr/bin/env python3
"""
Script to update all files to use the unified pricing module
"""

import os
import re

BASE_DIR = "/Users/brandonschaefer/Projects/Final-Banner-Site"

def update_order_details():
    """Update OrderDetails.tsx to use unified pricing"""
    file_path = os.path.join(BASE_DIR, "src/components/orders/OrderDetails.tsx")
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Update imports
    old_import = "import { usd, formatDimensions, calculatePolePocketCostFromOrder, calculateUnitPriceFromOrder } from '@/lib/pricing';"
    new_import = """import { usd } from '@/lib/pricing';
import { formatDimensions, calculateOrderTotals } from '@/lib/order-pricing';
import OrderItemBreakdown from './OrderItemBreakdown';"""
    
    content = content.replace(old_import, new_import)
    
    # Replace the pricing breakdown section
    old_breakdown_pattern = r'{\*/\* Cost Breakdown \*/}.*?</div>\s*</div>\s*</div>'
    new_breakdown = """{/* Cost Breakdown - Using Unified Pricing Module */}
                      <OrderItemBreakdown item={item} />"""
    
    # Use a simpler string replacement for the breakdown
    if "Price Breakdown</h5>" in content:
        # Find and replace the entire breakdown div
        start_marker = "{/* Cost Breakdown */}"
        end_marker = "</div>\n                      </div>"
        
        start_idx = content.find(start_marker)
        if start_idx != -1:
            # Find the end of the breakdown section
            temp_content = content[start_idx:]
            # Count divs to find matching close
            div_count = 0
            in_breakdown = False
            end_idx = start_idx
            
            for i, char in enumerate(temp_content):
                if temp_content[i:i+4] == '<div':
                    div_count += 1
                    in_breakdown = True
                elif temp_content[i:i+6] == '</div>':
                    div_count -= 1
                    if in_breakdown and div_count == 0:
                        end_idx = start_idx + i + 6
                        break
            
            if end_idx > start_idx:
                content = content[:start_idx] + new_breakdown + content[end_idx:]
    
    # Replace order totals calculation
    if "Calculate correct subtotal and tax from line totals" in content:
        old_totals_start = content.find("{(() => {")
        old_totals_end = content.find("})()}", old_totals_start) + 5
        
        new_totals = """{(() => {
              // Calculate totals using unified pricing module
              const totals = calculateOrderTotals(order.items);
              
              return (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Subtotal</span>
                    <span className="text-gray-900">
                      {usd(totals.subtotal_cents / 100)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Tax (6%)</span>
                    <span className="text-gray-900">
                      {usd(totals.tax_cents / 100)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-200 pt-2">
                    <span className="text-lg font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-gray-900">
                      {usd(totals.total_cents / 100)}
                    </span>
                  </div>
                </>
              );
            })()}"""
        
        if old_totals_start != -1 and old_totals_end > old_totals_start:
            content = content[:old_totals_start] + new_totals + content[old_totals_end:]
    
    # Write updated content
    with open(file_path, 'w') as f:
        f.write(content)
    
    print(f"✅ Updated {file_path}")

def main():
    print("🚀 Starting pricing unification updates...\n")
    
    try:
        update_order_details()
        
        print("\n✅ OrderDetails.tsx updated successfully!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
