'use strict';

// Native disclosure navigation for server-rendered referral pages. It works
// without JavaScript and under these pages' restrictive content security policy.
function siteNavigation() {
  const links = [
    ['Home', '/'], ['Vinyl Banners', '/vinyl-banners'],
    ['Double-Sided Banners', '/double-sided-banners'], ['Yard Signs', '/yard-signs'],
    ['Car Magnets', '/car-magnets'], ['Shipping', '/shipping'], ['Blog', '/blog'],
    ['Design Tool', '/design'], ['Request a Custom Quote', '/custom-quote'],
    ['About', '/about'], ['FAQ', '/faq'], ['Contact', '/contact'],
    ['My Orders', '/my-orders'], ['Sign In', '/sign-in'],
  ];
  return `<nav aria-label="Primary navigation"><details style="position:relative;z-index:60"><summary style="cursor:pointer;padding:12px 16px;border:1px solid #cbd5e1;border-radius:8px;color:#122641;background:white;font:700 14px/20px Arial">Menu</summary><div style="position:absolute;right:0;top:100%;width:min(280px,85vw);max-height:70vh;overflow:auto;background:white;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 12px 30px #12264126">${links.map(([label, href]) => `<a href="${href}" style="display:block;text-align:left;padding:12px 18px;background:white;color:#122641;border-bottom:1px solid #edf0f3;border-radius:0;text-decoration:none;font:600 14px/20px Arial">${label}</a>`).join('')}</div></details></nav>`;
}
module.exports = { siteNavigation };
