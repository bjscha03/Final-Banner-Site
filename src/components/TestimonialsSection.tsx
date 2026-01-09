import React from 'react';
import { Star,  Sparkles } from 'lucide-react';

const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      name: "Dan Oliver",
      title: "Founder",
      company: "Dan-O's Seasoning",
      image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg",
      rating: 5,
      text: "I've been ordering banners from these guys since before they even launched their new website. They've handled every single one of my banner needs since the day I started my business."
    },
    {
      name: "Brandon Schaefer",
      title: "Marketing Manager",
      company: "HempRise LLC",
      image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1759933582/1758106259564_oysdje.jpg",
      rating: 5,
      text: "Best banner service I've used. The 24-hour turnaround saved our grand opening event. Quality exceeded expectations and pricing was very competitive."
    },
    {
      name: "Jennifer Chen",
      title: "Event Coordinator",
      company: "Premier Events",
      image: "https://d64gsuwffb70l.cloudfront.net/68bb812d3c680d9a9bc2bdd7_1757118820418_895c1191.webp",
      rating: 5,
      text: "We order dozens of banners monthly for events. Banners On The Fly consistently delivers premium quality with fast turnaround. Highly recommended!"
    }
  ];

  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      {/* Vibrant gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#18448D] to-slate-900" />
      
      {/* Animated gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#ff6b35]/30 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#18448D]/40 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-[#ff6b35]/20 to-[#18448D]/20 rounded-full blur-3xl" />
      
      {/* Decorative pattern overlay */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white font-medium text-sm mb-6 shadow-lg">
            <Sparkles className="w-4 h-4 text-[#ff6b35]" />
            <span>Trusted by Thousands</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4 drop-shadow-lg">
            Customer Reviews
          </h2>
          <p className="text-lg text-blue-100/80 max-w-2xl mx-auto">
            See what our customers have to say about their experience
          </p>
        </div>

        {/* Reviews Grid */}
        <div className="grid md:grid-cols-3 gap-8 lg:gap-10 pt-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="group relative pt-4"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {/* Outer glow effect */}
              <div className="absolute -inset-1 top-3 bg-gradient-to-r from-[#ff6b35] via-[#f7931e] to-[#18448D] rounded-3xl blur-lg opacity-40 group-hover:opacity-75 transition-all duration-500 group-hover:blur-xl" />
              
              
              {/* Card */}
              <div className="relative bg-gradient-to-br from-white via-white to-blue-50/50 rounded-3xl p-8 transition-all duration-500 group-hover:-translate-y-3 shadow-2xl shadow-black/20 border border-white/50 overflow-hidden">
                {/* Inner decorative gradient */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-[#ff6b35]/10 to-transparent rounded-full blur-2xl" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-[#18448D]/10 to-transparent rounded-full blur-2xl" />
                
                {/* Star rating with glow */}
                <div className="relative flex items-center gap-1.5 mb-6">
                  <div className="absolute inset-0 bg-amber-400/20 blur-xl rounded-full" />
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star 
                      key={i} 
                      className="relative h-6 w-6 fill-amber-400 text-amber-400 drop-shadow-lg animate-pulse" 
                      style={{ animationDelay: `${i * 100}ms`, animationDuration: '2s' }}
                    />
                  ))}
                </div>
                
                {/* Review text */}
                <div className="relative mb-8">
                  <p className="text-slate-700 leading-relaxed text-base font-medium">
                    <span className="text-3xl text-[#ff6b35] font-serif leading-none mr-1">"</span>
                    {testimonial.text}
                    <span className="text-3xl text-[#ff6b35] font-serif leading-none ml-1">"</span>
                  </p>
                </div>
                
                {/* Author section with enhanced styling */}
                <div className="relative flex items-center gap-4 pt-6 border-t-2 border-gradient-to-r border-slate-100">
                  {/* Decorative line */}
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#ff6b35] via-[#f7931e] to-[#18448D] opacity-30 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative">
                    {/* Multi-layer glow effect */}
                    <div className="absolute -inset-2 bg-gradient-to-br from-[#ff6b35] to-[#18448D] rounded-full blur-md opacity-50 group-hover:opacity-80 transition-opacity duration-500 animate-pulse" />
                    <div className="absolute -inset-1 bg-gradient-to-br from-[#ff6b35] to-[#18448D] rounded-full opacity-70" />
                    <img
                      src={testimonial.image}
                      alt={testimonial.name}
                      className="relative w-16 h-16 rounded-full object-cover ring-4 ring-white shadow-xl transform group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 text-lg group-hover:text-[#18448D] transition-colors duration-300">
                      {testimonial.name}
                    </div>
                    <div className="text-sm text-slate-500 font-medium">
                      {testimonial.title}
                    </div>
                    <div className="text-sm font-bold bg-gradient-to-r from-[#ff6b35] via-[#f7931e] to-[#ff8c42] bg-clip-text text-transparent">
                      {testimonial.company}
                    </div>
                  </div>
                  
                  {/* Verified badge */}
                  <div className="absolute top-8 right-0 px-3 py-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-bold rounded-full shadow-lg shadow-emerald-500/30">
                    ✓ Verified
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
