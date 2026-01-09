import React from 'react';
import { Star, Quote } from 'lucide-react';

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
    <section className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 py-16 md:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900">
            Customer Reviews
          </h2>
        </div>

        {/* Reviews Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="group relative bg-white rounded-2xl p-8 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl shadow-lg shadow-slate-200/50"
            >
              {/* Gradient border effect on hover */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#18448D] via-[#ff6b35] to-[#18448D] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-sm scale-[1.02]" />
              <div className="absolute inset-[1px] rounded-2xl bg-white -z-10" />
              
              {/* Quote icon */}
              <div className="absolute -top-4 -right-2 w-12 h-12 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                <Quote className="w-5 h-5 text-white fill-white" />
              </div>
              
              {/* Star rating */}
              <div className="flex items-center gap-1 mb-5">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star 
                    key={i} 
                    className="h-5 w-5 fill-amber-400 text-amber-400 drop-shadow-sm" 
                  />
                ))}
              </div>
              
              {/* Review text */}
              <div className="mb-8">
                <p className="text-slate-600 leading-relaxed text-[15px] italic">
                  "{testimonial.text}"
                </p>
              </div>
              
              {/* Author section */}
              <div className="flex items-center gap-4 pt-6 border-t border-slate-100">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#18448D] to-[#ff6b35] rounded-full blur-sm opacity-50 group-hover:opacity-75 transition-opacity" />
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="relative w-14 h-14 rounded-full object-cover ring-2 ring-white shadow-md"
                  />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-lg group-hover:text-[#18448D] transition-colors">
                    {testimonial.name}
                  </div>
                  <div className="text-sm text-slate-500">
                    {testimonial.title}
                  </div>
                  <div className="text-sm font-semibold bg-gradient-to-r from-[#ff6b35] to-[#f7931e] bg-clip-text text-transparent">
                    {testimonial.company}
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
