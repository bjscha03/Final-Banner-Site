/**
 * Event Helper Functions
 * Utilities for slug generation, Cloudinary transformation, and auto-summary generation
 */

/**
 * Generate URL-safe slug from title
 */
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

/**
 * Transform remote image URL to Cloudinary Fetch API URL
 */
function transformToCloudinaryFetch(remoteUrl) {
  if (!remoteUrl) return null;
  
  const CLOUDINARY_CLOUD_NAME = process.env.VITE_CLOUDINARY_CLOUD_NAME || 'demo';
  
  // Default transformation: auto format, auto quality, 1600x900 crop
  const transform = 'c_fill,g_auto,f_auto,q_auto,w_1600,h_900';
  
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transform}/${encodeURIComponent(remoteUrl)}`;
}

/**
 * Generate auto-summary for events (80-150 words)
 * Deterministic algorithm based on event data
 */
function generateAutoSummary(event) {
  const { title, category_name, city, state, start_at, venue } = event;
  
  // Category-specific intros
  const categoryIntros = {
    'Food Trucks': 'Join us for an exciting food truck event',
    'Festivals': 'Experience an unforgettable festival',
    'Trade Shows': 'Discover the latest innovations at this trade show',
    'Schools': 'Support our school community at this event',
    'Sports': 'Get ready for an action-packed sporting event',
    'Real Estate': 'Explore properties at this real estate event',
    'Breweries': 'Enjoy craft beverages at this brewery event',
    'Conferences': 'Network and learn at this professional conference',
    'Farmers Markets': 'Shop fresh, local produce at this farmers market',
    'Community': 'Connect with your community at this gathering',
    'Holidays/Seasonal': 'Celebrate the season at this special event',
    'Other': 'Join us for this special event'
  };
  
  const intro = categoryIntros[category_name] || 'Join us for this exciting event';
  
  // Format date
  const date = new Date(start_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  // Build summary
  let summary = `${intro} in ${city}, ${state}. `;
  summary += `${title} takes place on ${dateStr}`;
  if (venue) summary += ` at ${venue}`;
  summary += '. ';
  
  // Category-specific audience/highlight
  const categoryHighlights = {
    'Food Trucks': 'Perfect for food lovers and families looking for diverse culinary experiences.',
    'Festivals': 'Bring your friends and family for a day of entertainment and celebration.',
    'Trade Shows': 'Industry professionals and enthusiasts will find valuable networking opportunities.',
    'Schools': 'Students, parents, and community members are encouraged to participate.',
    'Sports': 'Athletes and fans alike will enjoy the competitive atmosphere.',
    'Real Estate': 'Prospective buyers and investors should not miss this opportunity.',
    'Breweries': 'Beer enthusiasts will appreciate the selection and atmosphere.',
    'Conferences': 'Professionals seeking to expand their knowledge and network should attend.',
    'Farmers Markets': 'Support local farmers and artisans while shopping for quality goods.',
    'Community': 'All community members are welcome to join and participate.',
    'Holidays/Seasonal': 'Celebrate with activities and entertainment for all ages.',
    'Other': 'Everyone is welcome to attend and enjoy.'
  };
  
  summary += categoryHighlights[category_name] || 'All are welcome to attend.';
  summary += ' ';
  
  // Banner material recommendation
  const meshCategories = ['Sports', 'Farmers Markets'];
  const material = meshCategories.includes(category_name) ? 'mesh' : 'vinyl';
  
  summary += `Make your presence known with custom ${material} banners - perfect for this type of event. `;
  summary += 'We offer 24-hour production with free next-day air shipping!';
  
  return summary;
}

module.exports = {
  generateSlug,
  transformToCloudinaryFetch,
  generateAutoSummary
};
