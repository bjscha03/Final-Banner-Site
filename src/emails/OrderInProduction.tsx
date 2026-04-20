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
  Row,
  Column,
  Img
} from '@react-email/components';

import { titleCaseName } from '../lib/strings';

interface OrderInProductionProps {
  to: string;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    items: Array<{
      name: string;
      quantity: number;
      dimensions: string;
      material: string;
    }>;
  };
}

export default function OrderInProduction({ order }: OrderInProductionProps) {
  const logoUrl = 'https://bannersonthefly.com/cld-assets/images/logo-compact.svg';

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
            <Heading style={headerTitle}>Your Order is Now in Production 🎯</Heading>
            <Text style={headerSubtitle}>
              We&apos;re preparing your order for production
            </Text>
          </Section>

          {/* Order Info Bar */}
          <Section style={orderInfoBar}>
            <Row>
              <Column>
                <Heading style={companyName}>Banners On The Fly</Heading>
                <Text style={orderType}>Order In Production</Text>
              </Column>
              <Column style={orderDetailsCol}>
                <Text style={orderLabel}>Order #</Text>
                <Text style={orderNumberStyle}>{order.orderNumber}</Text>
              </Column>
            </Row>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>
              Hi {titleCaseName(order.customerName)},
            </Text>

            <Text style={paragraph}>
              Good news — your order is now in production.
            </Text>

            <Text style={paragraph}>
              Our team is currently preparing your order for production. Once it&apos;s
              complete, it will ship out with tracking information sent to you
              immediately.
            </Text>

            {/* Order Details */}
            <Section style={detailsSection}>
              <Heading style={sectionTitle}>Order Details</Heading>
              <div style={detailsContainer}>
                {order.items.map((item, index) => (
                  <div key={index} style={detailRow}>
                    <Text style={detailLabel}>Order #:</Text>
                    <Text style={detailValue}>{order.orderNumber}</Text>
                  </div>
                ))}
                {order.items.map((item, index) => (
                  <div key={`detail-${index}`}>
                    <div style={detailRow}>
                      <Text style={detailLabel}>Size:</Text>
                      <Text style={detailValue}>{item.dimensions}</Text>
                    </div>
                    <div style={detailRow}>
                      <Text style={detailLabel}>Material:</Text>
                      <Text style={detailValue}>{item.material}</Text>
                    </div>
                    {order.items.length > 1 && (
                      <Hr style={itemDivider} />
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Text style={paragraph}>
              If you have any questions, feel free to reply to this email.
            </Text>

            <Text style={signoff}>
              Thanks for choosing Banners On The Fly!
            </Text>

            <Text style={teamSignature}>
              – Banners On The Fly Team
            </Text>
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

const logoSection = {
  textAlign: 'center' as const,
  padding: '10px 30px 0px',
  backgroundColor: '#ffffff',
};

const logoStyle = {
  display: 'block',
  margin: '0 auto',
  maxWidth: '200px',
  height: 'auto',
};

const header = {
  background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
  borderRadius: '12px 12px 0 0',
  padding: '20px 30px',
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

const orderInfoBar = {
  backgroundColor: '#fefce8',
  padding: '20px 30px',
  borderRadius: '0 0 8px 8px',
  marginBottom: '30px',
};

const companyName = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#d97706',
  margin: '0 0 5px 0',
};

const orderType = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};

const orderDetailsCol = {
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
  margin: '0 0 20px 0',
};

const sectionTitle = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1f2937',
  margin: '0 0 15px 0',
};

const detailsSection = {
  margin: '30px 0',
};

const detailsContainer = {
  backgroundColor: '#fefce8',
  border: '1px solid #fde68a',
  borderRadius: '8px',
  padding: '20px',
};

const detailRow = {
  display: 'flex',
  marginBottom: '8px',
};

const detailLabel = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
  minWidth: '80px',
  fontWeight: '600',
};

const detailValue = {
  fontSize: '14px',
  color: '#1f2937',
  margin: '0',
};

const itemDivider = {
  borderColor: '#fde68a',
  margin: '10px 0',
};

const signoff = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#374151',
  margin: '20px 0 5px 0',
  fontWeight: '600',
};

const teamSignature = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#6b7280',
  margin: '0 0 20px 0',
  fontStyle: 'italic',
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
