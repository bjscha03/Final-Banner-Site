const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/pages/FAQ.tsx', 'utf8');

// 1. Update turnaround time answer
content = content.replace(
  'answer: "We guarantee 24-hour production on all standard orders. Orders placed before 2 PM EST are typically printed and shipped the same day.",',
  'answer: "We guarantee 24-hour production on all standard orders.",'
);

// 2. Update cancel/modify order answer
content = content.replace(
  'answer: "Orders can be cancelled or modified within 1 hour of placement. After that, orders enter production and cannot be changed. Contact support immediately if you need to make changes.",',
  'answer: "Once you click the Final Order button, your order cannot be cancelled or modified. As soon as you upload a file, it immediately goes into production.",'
);

// 3. Add new FAQ about orders over 1,000 sq ft
// Find the shipping section and add the new FAQ after it
const shippingFAQ = `    {
      question: "What shipping options are available?",
      answer: "All orders include FREE next-day air shipping with 24-hour production. No minimum order required! We don't offer paid shipping upgrades since every order ships fast and free.",
      category: "Shipping"
    },`;

const newFAQ = `    {
      question: "What if I order more than 1,000 square feet?",
      answer: "For quantities greater than 1,000 sq ft, production time of 1–5 business days may be required. Ground or freight shipping may apply. Orders over 1,000 sq ft require a custom quote. Please contact us before placing your order.",
      category: "Production"
    },`;

content = content.replace(shippingFAQ, shippingFAQ + '\n' + newFAQ);

// Write the file back
fs.writeFileSync('src/pages/FAQ.tsx', content);
console.log('FAQ updates completed successfully!');
