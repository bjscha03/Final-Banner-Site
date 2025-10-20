import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Button,
  Hr,
} from '@react-email/components';

export default function AbandonedCartDiscount10({ 
  customerEmail = 'customer@example.com',
  cartItems = [],
  totalValue = 0,
  discountCode = 'CART10-XXXX',
  recoveryUrl = 'https://bannersonthefly.com/cart'
}) {
  const discountedTotal = totalValue * 0.9;
  const savings = totalValue - discountedTotal;

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={headerText}>Banners On The Fly</Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={heading}>Here's 10% off to complete your order! 🎁</Text>
            
            <Text style={paragraph}>
              We really want to help you get your custom banners!
            </Text>
            
            <Text style={paragraph}>
              As a thank you for considering us, here's a special <strong>10% discount</strong> just for you.
            </Text>

            {/* Discount Code Box */}
            <Section style={discountBox}>
              <Text style={discountLabel}>Your Discount Code:</Text>
              <Text style={discountCodeText}>{discountCode}</Text>
              <Text style={discountSubtext}>10% off • Expires in 48 hours</Text>
            </Section>

            {/* Cart Items */}
            {cartItems.length > 0 && (
              <Section style={cartSection}>
                <Text style={cartHeading}>Your Cart:</Text>
                {cartItems.map((item, index) => (
                  <Section key={index} style={cartItem}>
                    <Text style={itemText}>
                      <strong>{item.width_in}" × {item.height_in}"</strong> {item.material} banner
                      {item.quantity > 1 && ` (×${item.quantity})`}
                    </Text>
                    <Text style={itemPrice}>
                      ${(item.line_total_cents / 100).toFixed(2)}
                    </Text>
                  </Section>
                ))}
                <Hr style={divider} />
                <Section style={totalSection}>
                  <Text style={originalPrice}>
                    Original: <span style={strikethrough}>${totalValue.toFixed(2)}</span>
                  </Text>
                  <Text style={savingsText}>
                    You Save: ${savings.toFixed(2)}
                  </Text>
                  <Text style={totalPrice}>
                    New Total: ${discountedTotal.toFixed(2)}
                  </Text>
                </Section>
              </Section>
            )}

            {/* CTA Button */}
            <Section style={buttonSection}>
              <Button style={button} href={recoveryUrl}>
                Claim Your 10% Discount
              </Button>
            </Section>

            <Text style={paragraph}>
              Your discount code will be automatically applied when you click the button above!
            </Text>

            <Text style={smallText}>
              Questions? Just reply to this email - we're here to help!
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Banners On The Fly - Professional Custom Banners
            </Text>
            <Text style={footerText}>
              <Link href="https://bannersonthefly.com" style={link}>
                bannersonthefly.com
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
  backgroundColor: '#18448D',
  padding: '24px',
  textAlign: 'center',
};

const headerText = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
};

const content = {
  padding: '0 48px',
};

const heading = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#18448D',
  marginTop: '32px',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#525f7f',
  marginBottom: '16px',
};

const discountBox = {
  backgroundColor: '#ff6b35',
  borderRadius: '12px',
  padding: '32px',
  textAlign: 'center',
  marginTop: '24px',
  marginBottom: '24px',
};

const discountLabel = {
  fontSize: '14px',
  color: '#ffffff',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  marginBottom: '8px',
};

const discountCodeText = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#ffffff',
  letterSpacing: '2px',
  margin: '16px 0',
  fontFamily: 'monospace',
};

const discountSubtext = {
  fontSize: '14px',
  color: '#ffffff',
  marginTop: '8px',
};

const cartSection = {
  backgroundColor: '#f6f9fc',
  borderRadius: '8px',
  padding: '24px',
  marginTop: '24px',
  marginBottom: '24px',
};

const cartHeading = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#18448D',
  marginBottom: '16px',
};

const cartItem = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '12px',
};

const itemText = {
  fontSize: '14px',
  color: '#525f7f',
  margin: '0',
};

const itemPrice = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#18448D',
  margin: '0',
};

const divider = {
  borderColor: '#e6ebf1',
  margin: '16px 0',
};

const totalSection = {
  marginTop: '16px',
};

const originalPrice = {
  fontSize: '14px',
  color: '#8898aa',
  marginBottom: '8px',
};

const strikethrough = {
  textDecoration: 'line-through',
};

const savingsText = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#ff6b35',
  marginBottom: '8px',
};

const totalPrice = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#18448D',
  marginTop: '8px',
};

const buttonSection = {
  textAlign: 'center',
  marginTop: '32px',
  marginBottom: '32px',
};

const button = {
  backgroundColor: '#ff6b35',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
  padding: '14px 32px',
};

const smallText = {
  fontSize: '14px',
  color: '#8898aa',
  lineHeight: '20px',
  marginTop: '24px',
};

const footer = {
  padding: '0 48px',
  marginTop: '32px',
  textAlign: 'center',
};

const footerText = {
  fontSize: '12px',
  color: '#8898aa',
  lineHeight: '16px',
  margin: '4px 0',
};

const link = {
  color: '#18448D',
  textDecoration: 'underline',
};
