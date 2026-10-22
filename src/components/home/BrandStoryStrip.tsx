import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, ImagePlus, Plane } from 'lucide-react';

export default function BrandStoryStrip() {
  return <div className="bof-home-story">
    <section className="bof-benefit-strip" aria-label="Why Banners On The Fly">
      <div><ImagePlus aria-hidden="true" /><h2>Make it yours.</h2><p>Upload your artwork. Customize your product. Preview before you order.</p></div>
      <div><Clock3 aria-hidden="true" /><h2>Made to move.</h2><p>Most standard orders are produced within 24 hours. See your product’s schedule.</p></div>
      <div><Plane aria-hidden="true" /><h2>Skip the slow lane.</h2><p>Free next-day air after production on orders $20 and up.</p></div>
    </section>
    <section className="bof-event-feature">
      <div><p className="campaign-eyebrow">Your brand. Everywhere.</p><h2>Own the room.<br />And the sidewalk.</h2><p>Bring it all together with custom banners, flags, displays and event gear.</p><Link className="bof-pill" to="/products">Explore displays <ArrowRight aria-hidden="true" /></Link></div>
      <img src="/images/campaign/retractable-1536.webp" alt="Coordinated branded retractable banner stands" width="1536" height="1024" loading="lazy" />
    </section>
  </div>;
}
