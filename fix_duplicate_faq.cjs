const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/pages/FAQ.tsx', 'utf8');

// Remove the duplicate FAQ entry
const duplicateFAQ = `    {
      question: "What if I order more than 1,000 square feet?",
      answer: "For quantities greater than 1,000 sq ft, production time of 1–5 business days may be required. Ground or freight shipping may apply. Orders over 1,000 sq ft require a custom quote. Please contact us before placing your order.",
      category: "Production"
    },
    {
      question: "What if I order more than 1,000 square feet?",
      answer: "For quantities greater than 1,000 sq ft, production time of 1–5 business days may be required. Ground or freight shipping may apply. Orders over 1,000 sq ft require a custom quote. Please contact us before placing your order.",
      category: "Production"
    },`;

const singleFAQ = `    {
      question: "What if I order more than 1,000 square feet?",
      answer: "For quantities greater than 1,000 sq ft, production time of 1–5 business days may be required. Ground or freight shipping may apply. Orders over 1,000 sq ft require a custom quote. Please contact us before placing your order.",
      category: "Production"
    },`;

content = content.replace(duplicateFAQ, singleFAQ);

// Write the file back
fs.writeFileSync('src/pages/FAQ.tsx', content);
console.log('Duplicate FAQ removed successfully!');
