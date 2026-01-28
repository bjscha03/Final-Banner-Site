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
      // Design Service fields
      design_service_enabled?: boolean;
      design_request_text?: string;
      design_draft_preference?: 'email' | 'text';
      design_draft_contact?: string;
      design_uploaded_assets?: Array<{
        name: string;
        url: string;
      }>;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    shipping_name?: string | null;
    shipping_street?: string | null;
    shipping_city?: string | null;
    shipping_state?: string | null;
    shipping_zip?: string | null;
    shipping_country?: string | null;
    created_at?: string;
  };
  invoiceUrl: string;
}

export default function AdminOrderNotification({ order, invoiceUrl }: AdminOrderNotificationProps) {
  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York'
      })
    : new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York'
      });

  // Logo URL for email - use environment-aware URL
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';

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

          {/* Order Quick Summary Card */}
          <Section style={quickSummaryCard}>
            <div style={summaryRow}>
              <div style={summaryItem}>
                <Text style={summaryLabel}>Order #</Text>
                <Text style={summaryValue}>{order.number}</Text>
              </div>
              <div style={summaryItem}>
                <Text style={summaryLabel}>Total</Text>
                <Text style={summaryValueHighlight}>${order.total.toFixed(2)}</Text>
              </div>
            </div>
          </Section>

          {/* Order Details */}
          <Section style={content}>
            <Heading style={sectionTitle}>📋 Order Details</Heading>

            <div style={detailsCard}>
              <div style={detailRowStyled}>
                <Text style={label}>Customer Name</Text>
                <Text style={value}>{order.customerName}</Text>
              </div>

              <div style={detailRowStyled}>
                <Text style={label}>Email Address</Text>
                <Text style={value}>
                  <Link href={`mailto:${order.email}`} style={link}>
                    {order.email}
                  </Link>
                </Text>
              </div>

              <div style={detailRowStyled}>
                <Text style={label}>Order Date</Text>
                <Text style={value}>{formattedDate}</Text>
              </div>

              <div style={detailRowStyled}>
                <Text style={label}>Order ID</Text>
                <Text style={valueMonospace}>{order.id}</Text>
              </div>
            </div>
          </Section>

          {/* Order Items */}
          <Section style={itemsSection}>
            <Heading style={sectionTitle}>🛒 Order Items</Heading>
            <div style={itemsContainer}>
              {order.items.map((item, index) => (
                <div key={index} style={itemBox}>
                  <div style={itemHeader}>
                    <Text style={itemName}>{item.name}</Text>
                    <Text style={itemPrice}>${item.price.toFixed(2)}</Text>
                  </div>
                  <Text style={itemDetails}>Qty: {item.quantity}</Text>
                  {item.options && (
                    <Text style={itemOptions}>{item.options}</Text>
                  )}
                  {item.design_service_enabled && (
                    <Text style={designBadge}>✨ Design Service</Text>
                  )}
                </div>
              ))}

              {/* Order Totals */}
              <div style={totalsBox}>
                <div style={totalRow}>
                  <Text style={totalLabel}>Subtotal</Text>
                  <Text style={totalAmount}>${order.subtotal.toFixed(2)}</Text>
                </div>
                {order.tax > 0 && (
                  <div style={totalRow}>
                    <Text style={totalLabel}>Tax</Text>
                    <Text style={totalAmount}>${order.tax.toFixed(2)}</Text>
                  </div>
                )}
                <div style={finalTotalRow}>
                  <Text style={finalTotalLabel}>Total Paid</Text>
                  <Text style={finalTotalAmount}>${order.total.toFixed(2)}</Text>
                </div>
              </div>
            </div>
          </Section>

          {/* Shipping Address */}
          {(order.shipping_name || order.shipping_street) && (
            <Section style={shippingSection}>
              <Heading style={sectionTitle}>📦 Shipping Address</Heading>
              <div style={addressBox}>
                {order.shipping_name && <Text style={addressName}>{order.shipping_name}</Text>}
                {order.shipping_street && <Text style={addressText}>{order.shipping_street}</Text>}
                {(order.shipping_city || order.shipping_state || order.shipping_zip) && (
                  <Text style={addressText}>
                    {order.shipping_city}{order.shipping_city && order.shipping_state ? ', ' : ''}{order.shipping_state} {order.shipping_zip}
                  </Text>
                )}
                {order.shipping_country && order.shipping_country !== 'US' && (
                  <Text style={addressText}>{order.shipping_country}</Text>
                )}
              </div>
            </Section>
          )}

          {/* Design Service Request Section */}
          {order.items.some(item => item.design_service_enabled) && (
            <Section style={designServiceSection}>
              <Heading style={designServiceHeading}>⚡ Action Required: Design Service Order</Heading>
              <Text style={designServiceAlert}>
                This customer has requested our design team to create their banner. Please review the details below and begin working on their design.
              </Text>
              {order.items.filter(item => item.design_service_enabled).map((item, index) => (
                <div key={index} style={designServiceBox}>
                  <div style={designServiceRow}>
                    <Text style={designServiceLabel}>How to Send Drafts</Text>
                    <Text style={designServiceValue}>
                      {item.design_draft_preference === 'email' ? '📧 Email' : '📱 Text Message'}: {item.design_draft_contact}
                    </Text>
                  </div>
                  {item.design_request_text && (
                    <div style={designServiceRow}>
                      <Text style={designServiceLabel}>Customer's Design Description</Text>
                      <Text style={designServiceDescription}>{item.design_request_text}</Text>
                    </div>
                  )}
                  {item.design_uploaded_assets && item.design_uploaded_assets.length > 0 && (
                    <div style={designServiceRow}>
                      <Text style={designServiceLabel}>Customer's Uploaded Files ({item.design_uploaded_assets.length})</Text>
                      <div style={assetsContainer}>
                        {item.design_uploaded_assets.map((asset, assetIdx) => (
                          <Text key={assetIdx} style={assetLink}>
                            <Link href={asset.url} style={assetLinkStyle}>📎 {asset.name}</Link>
                          </Text>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Action Button */}
          <Section style={actionSection}>
            <Link href={invoiceUrl} style={actionButton}>
              View Full Order in Admin Panel
            </Link>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This is an automated notification from Banners On The Fly.
            </Text>
            <Text style={footerLinks}>
              <Link href="https://bannersonthefly.com" style={footerLink}>
                Website
              </Link>
              {' • '}
              <Link href={`mailto:${order.email}`} style={footerLink}>
                Email Customer
              </Link>
            </Text>
            <Text style={footerCopyright}>
              © {new Date().getFullYear()} Banners On The Fly. All rights reserved.
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
  padding: '0',
  marginBottom: '64px',
  maxWidth: '600px',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  overflow: 'hidden' as const,
};

const logoSection = {
  textAlign: 'center' as const,
  padding: '24px 30px 16px',
  backgroundColor: '#ffffff',
};

const logoStyle = {
  display: 'block',
  margin: '0 auto',
  maxWidth: '180px',
  height: 'auto',
};

const header = {
  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
  padding: '32px 24px',
  textAlign: 'center' as const,
};

const headerTitle = {
  color: '#ffffff',
  fontSize: '26px',
  fontWeight: '700',
  margin: '0 0 8px',
};

const headerSubtitle = {
  color: 'rgba(255, 255, 255, 0.9)',
  fontSize: '15px',
  margin: '0',
};

// Quick Summary Card
const quickSummaryCard = {
  backgroundColor: '#f0fdf4',
  padding: '20px 24px',
  borderBottom: '1px solid #d1fae5',
};

const summaryRow = {
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  textAlign: 'center' as const,
};

const summaryItem = {
  flex: '1',
};

const summaryLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
};

const summaryValue = {
  color: '#1f2937',
  fontSize: '20px',
  fontWeight: '700',
  margin: '0',
  fontFamily: 'monospace',
};

const summaryValueHighlight = {
  color: '#059669',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0',
};

const content = {
  padding: '24px',
};

const sectionTitle = {
  color: '#1f2937',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0 0 16px',
};

// Details Card
const detailsCard = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  overflow: 'hidden' as const,
};

const detailRowStyled = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid #e5e7eb',
};

const label = {
  color: '#6b7280',
  fontSize: '13px',
  fontWeight: '600',
  margin: '0',
};

const value = {
  color: '#1f2937',
  fontSize: '14px',
  fontWeight: '500',
  margin: '0',
  textAlign: 'right' as const,
};

const valueMonospace = {
  color: '#1f2937',
  fontSize: '12px',
  fontWeight: '500',
  margin: '0',
  fontFamily: 'monospace',
  textAlign: 'right' as const,
};

const link = {
  color: '#2563eb',
  textDecoration: 'none',
  fontWeight: '500',
};

const itemsSection = {
  padding: '0 24px 24px',
};

const itemsContainer = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden' as const,
};

const itemBox = {
  padding: '16px',
  borderBottom: '1px solid #f3f4f6',
};

const itemOptions = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '4px 0 0',
};

const designBadge = {
  display: 'inline-block',
  backgroundColor: '#faf5ff',
  color: '#7c3aed',
  fontSize: '11px',
  fontWeight: '600',
  padding: '4px 8px',
  borderRadius: '4px',
  marginTop: '8px',
};

const itemHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '6px',
};

const itemName = {
  color: '#1f2937',
  fontSize: '15px',
  fontWeight: '600',
  margin: '0',
};

const itemPrice = {
  color: '#059669',
  fontSize: '15px',
  fontWeight: '700',
  margin: '0',
};

const itemDetails = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '2px 0 0',
};

const totalsBox = {
  backgroundColor: '#f9fafb',
  padding: '16px',
};

const totalRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid #e5e7eb',
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
  padding: '16px 0 0',
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
  fontSize: '20px',
  fontWeight: '700',
  margin: '0',
};

const shippingSection = {
  padding: '0 24px 24px',
};

const addressBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
};

const addressName = {
  color: '#1f2937',
  fontSize: '15px',
  fontWeight: '600',
  margin: '0 0 4px',
};

const addressText = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
};

const actionSection = {
  padding: '8px 24px 32px',
  textAlign: 'center' as const,
};

const actionButton = {
  backgroundColor: '#059669',
  color: '#ffffff',
  padding: '14px 32px',
  textDecoration: 'none',
  borderRadius: '8px',
  display: 'inline-block',
  fontWeight: '600',
  fontSize: '15px',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '0',
};

const footer = {
  padding: '24px',
  backgroundColor: '#f9fafb',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '0 0 8px',
};

const footerLinks = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '0 0 12px',
};

const footerLink = {
  color: '#2563eb',
  textDecoration: 'none',
};

const footerCopyright = {
  color: '#9ca3af',
  fontSize: '11px',
  margin: '0',
};

// Design Service styles
const designServiceSection = {
  padding: '0 24px 24px',
};

const designServiceHeading = {
  color: '#7c3aed',
  fontSize: '18px',
  fontWeight: '700',
  margin: '0 0 12px',
};

const designServiceAlert = {
  backgroundColor: '#faf5ff',
  border: '2px solid #c4b5fd',
  borderRadius: '8px',
  padding: '16px',
  color: '#6b21a8',
  fontSize: '14px',
  lineHeight: '1.5',
  marginBottom: '16px',
  textAlign: 'center' as const,
};

const designServiceBox = {
  backgroundColor: '#ffffff',
  border: '1px solid #e9d5ff',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '12px',
};

const designServiceRow = {
  marginBottom: '16px',
};

const designServiceLabel = {
  color: '#7c3aed',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 6px',
};

const designServiceValue = {
  color: '#1f2937',
  fontSize: '14px',
  margin: '0',
  fontWeight: '500',
};

const designServiceDescription = {
  color: '#374151',
  fontSize: '14px',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
  backgroundColor: '#faf5ff',
  border: '1px solid #e9d5ff',
  borderRadius: '6px',
  padding: '12px',
  lineHeight: '1.5',
};

const assetsContainer = {
  backgroundColor: '#faf5ff',
  borderRadius: '6px',
  padding: '8px',
};

const assetLink = {
  margin: '4px 0',
  display: 'block',
};

const assetLinkStyle = {
  color: '#7c3aed',
  fontSize: '13px',
  textDecoration: 'none',
  fontWeight: '500',
};
