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
  Link
} from '@react-email/components';

interface ContactReceivedProps {
  contact: {
    id: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    created_at: string;
  };
}

export default function ContactReceived({ contact }: ContactReceivedProps) {
  const formattedDate = new Date(contact.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={headerTitle}>New Contact Form Submission</Heading>
            <Text style={headerSubtitle}>
              A customer has submitted a message through the contact form
            </Text>
          </Section>

          {/* Contact Details */}
          <Section style={content}>
            <Heading style={sectionTitle}>Contact Information</Heading>
            
            <div style={detailRow}>
              <Text style={label}>Name:</Text>
              <Text style={value}>{contact.name}</Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Email:</Text>
              <Text style={value}>
                <Link href={`mailto:${contact.email}`} style={link}>
                  {contact.email}
                </Link>
              </Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Subject:</Text>
              <Text style={value}>{contact.subject}</Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Submitted:</Text>
              <Text style={value}>{formattedDate}</Text>
            </div>
            
            <div style={detailRow}>
              <Text style={label}>Contact ID:</Text>
              <Text style={value}>{contact.id}</Text>
            </div>
          </Section>

          {/* Message */}
          <Section style={messageSection}>
            <Heading style={sectionTitle}>Message</Heading>
            <div style={messageBox}>
              <Text style={messageText}>{contact.message}</Text>
            </div>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This is an automated notification from the Banners On The Fly contact form.
            </Text>
            <Text style={footerText}>
              <Link href="https://bannersonthefly.com" style={link}>
                Visit website
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
  backgroundColor: '#dc2626',
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
  color: '#fecaca',
  fontSize: '16px',
  margin: '0',
};

const content = {
  padding: '24px',
};

const sectionTitle = {
  color: '#1f2937',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0 0 16px 0',
};

const detailRow = {
  marginBottom: '12px',
  display: 'flex',
  alignItems: 'flex-start',
};

const label = {
  color: '#6b7280',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
  minWidth: '80px',
  display: 'inline-block',
};

const value = {
  color: '#1f2937',
  fontSize: '14px',
  margin: '0',
  flex: '1',
};

const messageSection = {
  padding: '0 24px 24px',
};

const messageBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '16px',
};

const messageText = {
  color: '#1f2937',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
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
  color: '#dc2626',
  textDecoration: 'underline',
};
