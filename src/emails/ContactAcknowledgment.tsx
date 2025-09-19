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
  Img
} from '@react-email/components';

interface ContactAcknowledgmentProps {
  contact: {
    name: string;
    subject: string;
  };
}

export default function ContactAcknowledgment({ contact }: ContactAcknowledgmentProps) {
  // Logo URL for email - use environment-aware URL
  const logoUrl = `${process.env.NODE_ENV === 'development' ? 'http://localhost:8082' : 'https://www.bannersonthefly.com'}/images/logo-compact.svg`;
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
            <Heading style={headerTitle}>Message Received!</Heading>
            <Text style={headerSubtitle}>
              Thank you for contacting Banners On The Fly
            </Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>
              Hi {contact.name},
            </Text>
            
            <Text style={paragraph}>
              Thank you for reaching out to us! We've received your message about 
              "<strong>{contact.subject}</strong>" and our support team will review it shortly.
            </Text>

            <Text style={paragraph}>
              We typically respond to all inquiries within 24 hours during business days. 
              If your message is urgent, you can also reach us directly at:
            </Text>

            <div style={contactInfo}>
              <Text style={contactItem}>
                📧 Email: <Link href="mailto:support@bannersonthefly.com" style={link}>
                  support@bannersonthefly.com
                </Link>
              </Text>

            </div>

            <Text style={paragraph}>
              In the meantime, feel free to browse our website to learn more about our 
              custom banner printing services and design tools.
            </Text>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={button} href="https://bannersonthefly.com">
                Visit Our Website
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions? Contact us at{' '}
              <Link href="mailto:support@bannersonthefly.com" style={link}>
                support@bannersonthefly.com
              </Link>
            </Text>
            <Text style={footerText}>
              <Link href="https://bannersonthefly.com" style={link}>
                Banners On The Fly
              </Link>
              {' • '}
              <Link href="https://bannersonthefly.com/about" style={link}>
                About Us
              </Link>
              {' • '}
              <Link href="https://bannersonthefly.com/faq" style={link}>
                FAQ
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
  backgroundColor: '#2563eb',
  borderRadius: '8px 8px 0 0',
  padding: '32px 24px',
  textAlign: 'center' as const,
};

const headerTitle = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0 0 8px 0',
};

const headerSubtitle = {
  color: '#bfdbfe',
  fontSize: '16px',
  margin: '0',
};

const content = {
  padding: '24px',
};

const greeting = {
  color: '#1f2937',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 16px 0',
};

const paragraph = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};

const contactInfo = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '16px',
  margin: '16px 0',
};

const contactItem = {
  color: '#1f2937',
  fontSize: '14px',
  margin: '8px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '24px 0',
};

const button = {
  backgroundColor: '#2563eb',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
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

const link = {
  color: '#2563eb',
  textDecoration: 'underline',
};
