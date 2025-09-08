#!/usr/bin/env node

// Test order confirmation email
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load environment variables from .env file
function loadEnv() {
  try {
    const envContent = readFileSync('.env', 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.log('No .env file found or error reading it');
  }
}

async function testOrderEmail() {
  try {
    // Load environment variables
    loadEnv();
    
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    const sql = neon(dbUrl);
    
    // Get the most recent order
    const orders = await sql`
      SELECT id, email, total_cents, confirmation_email_status
      FROM orders
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    if (orders.length > 0) {
      const order = orders[0];
      console.log('Testing with order:', order.id);
      console.log('Email:', order.email);
      console.log('Total:', order.total_cents / 100);
      console.log('Email Status:', order.confirmation_email_status);
      
      // Test the order confirmation email
      console.log('\nTesting order confirmation email...');
      const response = await fetch('http://localhost:8888/.netlify/functions/notify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id })
      });
      
      const result = await response.json();
      console.log('Response status:', response.status);
      console.log('Response:', result);
    } else {
      console.log('No orders found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testOrderEmail();
