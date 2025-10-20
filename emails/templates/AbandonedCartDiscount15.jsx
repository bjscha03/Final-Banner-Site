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

export default function AbandonedCartDiscount15({ 
  customerEmail = 'customer@example.com',
  cartItems = [],
  totalValue = 0,
  discountCode = 'CART15-XXXX',
  recoveryUrl = 'https://bannersonthefly.com/cart'
}) {
  const discountedTotal = totalValue * 0.85;
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

          {/* Urgency Banner */}
          <Section style={urgencyBanner}>
            <Text style={urgencyText}>⏰ LAST CHANCE - Expires in 24 Hours!</Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={heading}>Final offer: 15% OFF your order! 🔥</Text>
            
            <Text style={paragraph}>
              This is our <strong>final reminder</strong> about your cart - and we're making it count!
            </Text>
            
            <Text style={paragraph}>
              We've increased your discount to <strong>15% OFF</strong> as a last chance to help you complete your custom banner order.
            </Text>

            {/* Discount Code Box */}
            <Section style={discountBox}>
              <Text style={discountLabel}>Your FINAL Discount Code:</Text>
              <Text style={discountCodeText}>{discountCode}</Text>
              <Text style={discountSubtext}>15% off • Expires in 24 hours ⏰</Text>
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
                    You Save: ${savings.toFixed(2)} (15% OFF!)
                  </Text>
                  <Text style={totalPrice}>
                    Final Price: ${discountedTotal.toFixed(2)}
                  </Text>
                </Section>
              </Section>
            )}

            {/* CTA Button */}
            <Section style={buttonSection}>
              <Button style={button} href={recoveryUrl}>
                Claim Your 15% Discount Now
              </Button>
            </Section>

            <Text style={urgencyParagraph}>
              ⚠️ <strong>This is your last chance!</strong> After 24 hours, this offer expires and your cart will be cleared.
            </Text>

            <Text style={smallText}>
              Questions? Reply to this email - we're here to help!
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

const urgencyBanner = {
  backgroundColor: '#dc3545',
  padding: '16px',
  textAlign: 'center',
};

const urgencyText = {
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0',
  textTransform: 'uppercase',
  letterSpacing: '1px',
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

const urgencyParagraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#dc3545',
  marginBottom: '16px',
  padding: '16px',
  backgroundColor: '#fff5f5',
  borderRadius: '8px',
  borderLeft: '4px solid #dc3545',
};

const discountBox = {
  backgroundColor: '#dc3545',
  borderRadius: '12px',
  padding: '32px',
  textAlign: 'center',
  marginTop: '24px',
  marginBottom: '24px',
  border: '3px solid #ff6b35',
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
  fontSize: '36px',
  fontWeight: 'bold',
  color: '#ffffff',
  letterSpacing: '2px',
  margin: '16px 0',
  fontFamily: 'monospace',
};

const discountSubtext = {
  fontSize: '16px',
  color: '#ffffff',
  marginTop: '8px',
  fontWeight: 'bold',
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
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#dc3545',
  marginBottom: '8px',
};

const totalPrice = {
  fontSize: '28px',
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
  backgroundColor: '#dc3545',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '18px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
  padding: '16px 40px',
  border: '2px solid #ff6b35',
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
