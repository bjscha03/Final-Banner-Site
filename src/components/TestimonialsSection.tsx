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
      text: "I've been ordering banners from these guys since before they even launched their new website. They've handled every single one of my banner needs since the day I started my business — and I can honestly say, they're the best in the game."
    },
    {
      name: "Sarah Johnson",
      title: "Marketing Director",
      company: "TechStart Inc.",
      image: "https://d64gsuwffb70l.cloudfront.net/68bb812d3c680d9a9bc2bdd7_1757118818687_27f339aa.webp",
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
    <section className="py-16 bg-gradient-to-br from-white via-gray-50/50 to-blue-50/30 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-br from-blue-200/30 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-gradient-to-tl from-indigo-200/30 to-transparent rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-4">
            Trusted by Business Owners on LinkedIn
          </h2>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Join thousands of satisfied customers who trust us for their banner printing needs
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="testimonial-card p-8">
              <div className="flex items-center mb-6">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 text-yellow-400 fill-current group-hover:scale-110 transition-transform duration-300" style={{transitionDelay: `${i * 50}ms`}} />
                ))}
              </div>

              <div className="relative mb-8">
                <Quote className="absolute -top-3 -left-3 h-10 w-10 text-blue-200 group-hover:text-blue-300 transition-colors duration-300" />
                <p className="text-gray-700 leading-relaxed pl-8 text-lg">
                  "{testimonial.text}"
                </p>
              </div>

              <div className="flex items-center">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="w-14 h-14 rounded-full object-cover mr-4 group-hover:scale-110 transition-transform duration-300 shadow-lg"
                />
                <div>
                  <h4 className="font-bold text-gray-900 text-lg">{testimonial.name}</h4>
                  <p className="text-sm text-gray-600 font-medium">{testimonial.title}</p>
                  <p className="text-sm bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent font-semibold">{testimonial.company}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <div className="inline-flex items-center space-x-6 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 px-8 py-4 rounded-2xl shadow-lg border border-blue-200/50 hover:shadow-xl transition-all duration-300 group">
            <div className="flex -space-x-3">
              {testimonials.map((testimonial, index) => (
                <img
                  key={index}
                  src={testimonial.image}
                  alt=""
                  className="w-10 h-10 rounded-full border-3 border-white object-cover shadow-md group-hover:scale-110 transition-transform duration-300"
                  style={{transitionDelay: `${index * 100}ms`}}
                />
              ))}
            </div>
            <div className="text-left">
              <p className="text-lg font-bold bg-gradient-to-r from-gray-900 to-blue-800 bg-clip-text text-transparent">10,000+ Happy Customers</p>
              <p className="text-sm text-gray-600 font-medium">Join our growing community</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;