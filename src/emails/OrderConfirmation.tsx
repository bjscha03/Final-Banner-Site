import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Heading,
  Hr,
  Link,
  Row,
  Column
} from '@react-email/components';

interface OrderConfirmationProps {
  to: string;
  order: {
    id: string;
    number?: string;
    orderNumber?: string;
    customerName?: string;
    items: Array<{
      name: string;
      qty?: number;
      quantity?: number;
      unitPriceCents?: number;
      price?: number;
      size?: string;
      options?: string;
    }>;
    subtotal?: number;
    subtotalCents?: number;
    tax?: number;
    taxCents?: number;
    total?: number;
    totalCents?: number;
    shippingAddress?: {
      name: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  invoiceUrl?: string;
}

export default function OrderConfirmation({ order, invoiceUrl }: OrderConfirmationProps) {
  const orderDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Handle different prop formats
  const orderNumber = order.number || order.orderNumber || order.id.slice(-8).toUpperCase();
  const customerName = order.customerName || 'Customer';
  const subtotal = order.subtotal || (order.subtotalCents ? order.subtotalCents / 100 : 0);
  const tax = order.tax || (order.taxCents ? order.taxCents / 100 : 0);
  const total = order.total || (order.totalCents ? order.totalCents / 100 : subtotal + tax);

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={headerTitle}>Order Confirmed!</Heading>
            <Text style={headerSubtitle}>
              Thank you for your order. We'll get started on your custom banners right away.
            </Text>
          </Section>

          {/* Order Info */}
          <Section style={orderInfo}>
            <Row>
              <Column>
                <Heading style={companyName}>Banners On The Fly</Heading>
                <Text style={orderType}>Custom Banner Order</Text>
              </Column>
              <Column style={orderDetails}>
                <Text style={orderLabel}>Order #</Text>
                <Text style={orderNumberStyle}>{orderNumber}</Text>
                <Text style={orderDate}>{orderDate}</Text>
              </Column>
            </Row>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>
              Hi {customerName},
            </Text>
            
            <Text style={paragraph}>
              Your order has been confirmed and we're preparing your custom banners. 
              You'll receive another email with tracking information once your order ships.
            </Text>

            {/* Order Items */}
            <Section style={itemsSection}>
              <Heading style={sectionTitle}>Order Items</Heading>
              <div style={itemsContainer}>
                {order.items.map((item, index) => {
                  const itemPrice = item.price || (item.unitPriceCents ? item.unitPriceCents / 100 : 0);
                  const itemQty = item.qty || item.quantity || 1;
                  const itemName = item.name + (item.size ? ` ${item.size}` : '');

                  return (
                    <div key={index} style={itemRow}>
                      <div style={itemInfo}>
                        <Text style={itemNameStyle}>{itemName}</Text>
                        {item.options && (
                          <Text style={itemOptions}>{item.options}</Text>
                        )}
                      </div>
                      <div style={itemPricing}>
                        <Text style={itemPriceStyle}>${itemPrice.toFixed(2)}</Text>
                        <Text style={itemQuantity}>Qty: {itemQty}</Text>
                      </div>
                    </div>
                  );
                })}
                
                {/* Totals */}
                <Hr style={itemsHr} />
                <div style={totalRow}>
                  <Text style={totalLabel}>Subtotal</Text>
                  <Text style={totalValue}>${subtotal.toFixed(2)}</Text>
                </div>
                {tax > 0 && (
                  <div style={totalRow}>
                    <Text style={totalLabel}>Tax</Text>
                    <Text style={totalValue}>${tax.toFixed(2)}</Text>
                  </div>
                )}
                <div style={finalTotalRow}>
                  <Text style={finalTotalLabel}>Total Paid</Text>
                  <Text style={finalTotalValue}>${total.toFixed(2)}</Text>
                </div>
              </div>
            </Section>

            {/* Shipping Address */}
            {order.shippingAddress && (
              <Section style={addressSection}>
                <Heading style={sectionTitle}>Shipping Address</Heading>
                <div style={addressContainer}>
                  <Text style={addressText}>{order.shippingAddress.name}</Text>
                  <Text style={addressText}>{order.shippingAddress.address1}</Text>
                  {order.shippingAddress.address2 && (
                    <Text style={addressText}>{order.shippingAddress.address2}</Text>
                  )}
                  <Text style={addressText}>
                    {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
                  </Text>
                </div>
              </Section>
            )}

            {/* Invoice Button */}
            {invoiceUrl && (
              <Section style={buttonContainer}>
                <Button style={button} href={invoiceUrl}>
                  View Invoice
                </Button>
              </Section>
            )}

            {/* What's Next */}
            <Section style={nextStepsSection}>
              <Heading style={sectionTitle}>What's Next?</Heading>
              <ul style={nextStepsList}>
                <li style={nextStepsItem}>We'll review your order and contact you within 24 hours</li>
                <li style={nextStepsItem}>Production typically takes 3-5 business days</li>
                <li style={nextStepsItem}>You'll receive tracking information once shipped</li>
                <li style={nextStepsItem}>Questions? Contact us at support@bannersonthefly.com</li>
              </ul>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Thank you for choosing Banners On The Fly!
            </Text>
            <Text style={footerText}>
              <Link href="https://bannersonthefly.com" style={link}>
                Visit our website
              </Link>
              {' • '}
              <Link href="mailto:support@bannersonthefly.com" style={link}>
                Contact Support
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const header = {
  background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
  borderRadius: '12px 12px 0 0',
  padding: '40px 30px',
  textAlign: 'center' as const,
  color: '#ffffff',
};

const headerTitle = {
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '0 0 10px 0',
  color: '#ffffff',
};

const headerSubtitle = {
  fontSize: '16px',
  margin: '0',
  opacity: '0.9',
  color: '#ffffff',
};

const orderInfo = {
  backgroundColor: '#f9fafb',
  padding: '20px 30px',
  borderRadius: '0 0 8px 8px',
  marginBottom: '30px',
};

const companyName = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#1e40af',
  margin: '0 0 5px 0',
};

const orderType = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};

const orderDetails = {
  textAlign: 'right' as const,
};

const orderLabel = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};

const orderNumberStyle = {
  fontSize: '16px',
  fontWeight: 'bold',
  fontFamily: 'monospace',
  margin: '0',
};

const orderDate = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '5px 0 0 0',
};

const content = {
  padding: '0 30px',
};

const greeting = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1f2937',
  margin: '0 0 20px 0',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#374151',
  margin: '0 0 30px 0',
};

const sectionTitle = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1f2937',
  margin: '0 0 15px 0',
};

const itemsSection = {
  margin: '30px 0',
};

const itemsContainer = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden',
};

const itemRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '15px 20px',
  borderBottom: '1px solid #f3f4f6',
};

const itemInfo = {
  flex: '1',
};

const itemNameStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1f2937',
  margin: '0 0 5px 0',
};

const itemOptions = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};

const itemPricing = {
  textAlign: 'right' as const,
  marginLeft: '20px',
};

const itemPriceStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1f2937',
  margin: '0 0 5px 0',
};

const itemQuantity = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};

const itemsHr = {
  borderColor: '#e5e7eb',
  margin: '0',
};

const totalRow = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '12px 20px',
  borderBottom: '1px solid #f3f4f6',
};

const totalLabel = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};

const totalValue = {
  fontSize: '14px',
  color: '#1f2937',
  margin: '0',
};

const finalTotalRow = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '20px',
  backgroundColor: '#f9fafb',
};

const finalTotalLabel = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#1f2937',
  margin: '0',
};

const finalTotalValue = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#1f2937',
  margin: '0',
};

const addressSection = {
  margin: '30px 0',
};

const addressContainer = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '20px',
};

const addressText = {
  fontSize: '14px',
  color: '#374151',
  margin: '0 0 5px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '30px 0',
};

const button = {
  backgroundColor: '#1e40af',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 28px',
  border: 'none',
};

const nextStepsSection = {
  backgroundColor: '#dbeafe',
  border: '1px solid #93c5fd',
  borderRadius: '8px',
  padding: '20px',
  margin: '30px 0',
};

const nextStepsList = {
  margin: '0',
  paddingLeft: '20px',
  color: '#1e40af',
};

const nextStepsItem = {
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 8px 0',
};

const link = {
  color: '#1e40af',
  textDecoration: 'underline',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '30px 0 20px 0',
};

const footer = {
  padding: '0 30px',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0 0 10px 0',
};
