import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Link,
  Img
} from '@react-email/components';

interface AdminOrderNotificationProps {
  order: {
    id: string;
    number: string;
    customerName: string;
    email: string;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      options: string;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    shippingAddress?: string;
    created_at?: string;
  };
  invoiceUrl: string;
}

export default function AdminOrderNotification({ order, invoiceUrl }: AdminOrderNotificationProps) {
  const formattedDate = order.created_at 
    ? new Date(order.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

  // Logo URL for email - use absolute URL for email compatibility
  const logoUrl = 'https://www.bannersonthefly.com/images/logo-compact.svg';

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Img
              src={logoUrl}
              alt="Banners On The Fly"
              width="200"
              height="60"
              style={logoStyle}
            />
          </Section>

          {/* Header */}
          <Section style={header}>
            <Heading style={headerTitle}>🎉 New Order Received!</Heading>
            <Text style={headerSubtitle}>
              A customer has placed a new order on Banners On The Fly
            </Text>
          </Section>

          {/* Order Summary */}
          <Section style={content}>
            <Heading style={sectionTitle}>Order Information</Heading>
            
            <div style={detailRow}>
              <Text style={label}>Order Number:</Text>
              <Text style={value}>#{order.number}</Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Order ID:</Text>
              <Text style={value}>{order.id}</Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Customer:</Text>
              <Text style={value}>{order.customerName}</Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Email:</Text>
              <Text style={value}>
                <Link href={`mailto:${order.email}`} style={link}>
                  {order.email}
                </Link>
              </Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Order Date:</Text>
              <Text style={value}>{formattedDate}</Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Total Amount:</Text>
              <Text style={totalValue}>${order.total.toFixed(2)}</Text>
            </div>
          </Section>

          {/* Order Items */}
          <Section style={itemsSection}>
            <Heading style={sectionTitle}>Order Items</Heading>
            {order.items.map((item, index) => (
              <div key={index} style={itemBox}>
                <div style={itemHeader}>
                  <Text style={itemName}>{item.name}</Text>
                  <Text style={itemPrice}>${item.price.toFixed(2)}</Text>
                </div>
                <Text style={itemDetails}>Quantity: {item.quantity}</Text>
                {item.options && (
                  <Text style={itemDetails}>{item.options}</Text>
                )}
              </div>
            ))}
            
            {/* Order Totals */}
            <div style={totalsBox}>
              <div style={totalRow}>
                <Text style={totalLabel}>Subtotal:</Text>
                <Text style={totalAmount}>${order.subtotal.toFixed(2)}</Text>
              </div>
              {order.tax > 0 && (
                <div style={totalRow}>
                  <Text style={totalLabel}>Tax:</Text>
                  <Text style={totalAmount}>${order.tax.toFixed(2)}</Text>
                </div>
              )}
              <div style={finalTotalRow}>
                <Text style={finalTotalLabel}>Total:</Text>
                <Text style={finalTotalAmount}>${order.total.toFixed(2)}</Text>
              </div>
            </div>
          </Section>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <Section style={shippingSection}>
              <Heading style={sectionTitle}>Shipping Address</Heading>
              <div style={addressBox}>
                <Text style={addressText}>{order.shippingAddress}</Text>
              </div>
            </Section>
          )}

          {/* Action Button */}
          <Section style={actionSection}>
            <Link href={invoiceUrl} style={actionButton}>
              View Full Order Details
            </Link>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This is an automated notification from Banners On The Fly order system.
            </Text>
            <Text style={footerText}>
              <Link href="https://bannersonthefly.com" style={link}>
                Visit website
              </Link>
              {' • '}
              <Link href={`mailto:${order.email}`} style={link}>
                Contact customer
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
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};

const logoSection = {
  textAlign: 'center' as const,
  padding: '20px 30px 10px',
  backgroundColor: '#ffffff',
};

const logoStyle = {
  display: 'block',
  margin: '0 auto',
  maxWidth: '200px',
  height: 'auto',
};

const header = {
  padding: '24px 24px 0',
  textAlign: 'center' as const,
};

const headerTitle = {
  color: '#059669',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px',
};

const headerSubtitle = {
  color: '#6b7280',
  fontSize: '16px',
  margin: '0',
};

const content = {
  padding: '24px',
};

const sectionTitle = {
  color: '#374151',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 16px',
};

const detailRow = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: '12px',
  gap: '12px',
};

const label = {
  color: '#6b7280',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
  minWidth: '120px',
  display: 'inline-block',
};

const value = {
  color: '#1f2937',
  fontSize: '14px',
  margin: '0',
  flex: '1',
};

const totalValue = {
  color: '#059669',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0',
  flex: '1',
};

const link = {
  color: '#2563eb',
  textDecoration: 'underline',
};

const itemsSection = {
  padding: '0 24px 24px',
};

const itemBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '12px',
};

const itemHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px',
};

const itemName = {
  color: '#1f2937',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0',
};

const itemPrice = {
  color: '#059669',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0',
};

const itemDetails = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '4px 0',
};

const totalsBox = {
  backgroundColor: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  padding: '16px',
  marginTop: '16px',
};

const totalRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px',
};

const totalLabel = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '0',
};

const totalAmount = {
  color: '#1f2937',
  fontSize: '14px',
  margin: '0',
};

const finalTotalRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: '8px',
  borderTop: '1px solid #d1d5db',
  marginTop: '8px',
};

const finalTotalLabel = {
  color: '#1f2937',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0',
};

const finalTotalAmount = {
  color: '#059669',
  fontSize: '18px',
  fontWeight: '700',
  margin: '0',
};

const shippingSection = {
  padding: '0 24px 24px',
};

const addressBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '16px',
};

const addressText = {
  color: '#1f2937',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
};

const actionSection = {
  padding: '0 24px 24px',
  textAlign: 'center' as const,
};

const actionButton = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '12px 24px',
  textDecoration: 'none',
  borderRadius: '6px',
  display: 'inline-block',
  fontWeight: '600',
  fontSize: '14px',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '20px 0',
};

const footer = {
  padding: '0 24px',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '4px 0',
};
