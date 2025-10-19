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
      text: "I've been ordering banners from these guys since before they even launched their new website. They've handled every single one of my banner needs since the day I started my business.\""
    },
    {
      name: "Brandon Schaefer",
      title: "Marketing Manager",
      company: "HempRise LLC",
      image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1759933582/1758106259564_oysdje.jpg",
      rating: 5,
      text: "Best banner service I've used. The 24-hour turnaround saved our grand opening event. Quality exceeded expectations and pricing was very competitive.\""
    },
    {
      name: "Jennifer Chen",
      title: "Event Coordinator",
      company: "Premier Events",
      image: "https://d64gsuwffb70l.cloudfront.net/68bb812d3c680d9a9bc2bdd7_1757118820418_895c1191.webp",
      rating: 5,
      text: "We order dozens of banners monthly for events. Banners On The Fly consistently delivers premium quality with fast turnaround. Highly recommended!\""
    }
  ];

  return (
    <section className="bg-slate-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Customer Reviews
          </h2>
          <div className="flex items-center justify-center gap-2">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-orange-500 text-orange-500" />
              ))}
            </div>
            <span className="text-slate-600 font-semibold">5.0 out of 5</span>
            <span className="text-slate-500">• 10,000+ reviews</span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-orange-500 text-orange-500" />
                ))}
              </div>
              
              <div className="relative mb-6">
                <Quote className="absolute -top-2 -left-2 h-8 w-8 text-[#18448D] rotate-180" />
                <p className="text-slate-700 leading-relaxed pl-6">
                  {testimonial.text}
                </p>
              </div>
              
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center gap-3">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className={`w-12 h-12 rounded-full object-cover border-2 border-slate-200 ${
                      testimonial.name === 'Jennifer Chen' ? 'object-top' : ''
                    }`}
                  />
                  <div className={testimonial.name === 'Jennifer Chen' ? 'self-center' : ''}>
                    <div className="font-semibold text-slate-900">{testimonial.name}</div>
                    <div className="text-sm text-slate-600">{testimonial.title}</div>
                    <div className="text-sm text-orange-600 font-semibold">{testimonial.company}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <div className="inline-flex items-center gap-4 bg-white border border-slate-200 px-6 py-4 rounded-lg shadow-sm">
            <div className="flex -space-x-2">
              {testimonials.map((testimonial, index) => (
                <img
                  key={index}
                  src={testimonial.image}
                  alt=""
                  className="w-10 h-10 rounded-full border-2 border-white object-cover"
                />
              ))}
            </div>
            <div className="text-left">
              <p className="text-lg font-bold text-slate-900">10,000+ Happy Customers</p>
              <p className="text-sm text-slate-600">Join our growing community</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
