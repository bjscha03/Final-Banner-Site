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
  Column,
  Img
} from '@react-email/components';

interface OrderCanceledProps {
  to: string;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      options?: string;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    shippingAddress?: {
      name: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
    };
  };
}

export default function OrderCanceled({ order }: OrderCanceledProps) {
  const cancelDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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
            <Heading style={headerTitle}>Order Canceled</Heading>
            <Text style={headerSubtitle}>
              Your order has been canceled and you will receive a full refund
            </Text>
          </Section>

          {/* Cancel Info */}
          <Section style={cancelInfo}>
            <Row>
              <Column>
                <Heading style={companyName}>Banners On The Fly</Heading>
                <Text style={orderType}>Order Cancellation</Text>
              </Column>
              <Column style={orderDetails}>
                <Text style={orderLabel}>Order #</Text>
                <Text style={orderNumber}>{order.orderNumber}</Text>
                <Text style={orderDate}>Canceled {cancelDate}</Text>
              </Column>
            </Row>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>
              Hi {order.customerName},
            </Text>
            
            <Text style={paragraph}>
              We're writing to confirm that your order has been canceled as requested. 
              We apologize for any inconvenience this may have caused.
            </Text>

            {/* Refund Information */}
            <Section style={refundSection}>
              <Heading style={sectionTitle}>Refund Information</Heading>
              <div style={refundContainer}>
                <Text style={refundText}>
                  <strong>Refund Amount:</strong> ${order.total.toFixed(2)}
                </Text>
                <Text style={refundText}>
                  <strong>Refund Method:</strong> Original payment method
                </Text>
                <Text style={refundText}>
                  <strong>Processing Time:</strong> 3-5 business days
                </Text>
                <Text style={refundNote}>
                  You'll receive a separate email confirmation once the refund has been processed.
                </Text>
              </div>
            </Section>

            {/* Canceled Items */}
            <Section style={itemsSection}>
              <Heading style={sectionTitle}>Canceled Items</Heading>
              <div style={itemsContainer}>
                {order.items.map((item, index) => (
                  <div key={index} style={itemRow}>
                    <div style={itemInfo}>
                      <Text style={itemName}>{item.name}</Text>
                      {item.options && (
                        <Text style={itemOptions}>{item.options}</Text>
                      )}
                    </div>
                    <div style={itemPricing}>
                      <Text style={itemPrice}>${item.price.toFixed(2)}</Text>
                      <Text style={itemQuantity}>Qty: {item.quantity}</Text>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Still Need Banners */}
            <Section style={helpSection}>
              <Heading style={sectionTitle}>Still Need Custom Banners?</Heading>
              <Text style={helpText}>
                We'd love to help you with your banner needs. If you canceled due to a specific 
                concern or if you'd like to place a new order with different specifications, 
                please don't hesitate to reach out to us.
              </Text>
              
              <Section style={buttonContainer}>
                <Button style={button} href="https://bannersonthefly.com">
                  Start New Order
                </Button>
              </Section>
            </Section>

            {/* Contact Info */}
            <Section style={contactSection}>
              <Heading style={sectionTitle}>Questions?</Heading>
              <Text style={contactText}>
                If you have any questions about this cancellation or your refund, 
                please contact our support team:
              </Text>
              <ul style={contactList}>
                <li style={contactItem}>
                  Email: <Link href="mailto:support@bannersonthefly.com" style={link}>
                    support@bannersonthefly.com
                  </Link>
                </li>
                <li style={contactItem}>
                  Phone: (555) 123-4567
                </li>
                <li style={contactItem}>
                  Hours: Monday-Friday, 9 AM - 5 PM EST
                </li>
              </ul>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Thank you for considering Banners On The Fly
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
  background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
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

const cancelInfo = {
  backgroundColor: '#fef2f2',
  padding: '20px 30px',
  borderRadius: '0 0 8px 8px',
  marginBottom: '30px',
};

const companyName = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#dc2626',
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

const orderNumber = {
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

const refundSection = {
  margin: '30px 0',
};

const refundContainer = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '8px',
  padding: '20px',
};

const refundText = {
  fontSize: '14px',
  color: '#92400e',
  margin: '0 0 8px 0',
};

const refundNote = {
  fontSize: '14px',
  color: '#92400e',
  margin: '15px 0 0 0',
  fontStyle: 'italic',
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

const itemName = {
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

const itemPrice = {
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

const helpSection = {
  backgroundColor: '#eff6ff',
  border: '1px solid #93c5fd',
  borderRadius: '8px',
  padding: '20px',
  margin: '30px 0',
};

const helpText = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#1e40af',
  margin: '0 0 20px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '20px 0 0 0',
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

const contactSection = {
  margin: '30px 0',
};

const contactText = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#374151',
  margin: '0 0 15px 0',
};

const contactList = {
  margin: '0',
  paddingLeft: '20px',
};

const contactItem = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#374151',
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
