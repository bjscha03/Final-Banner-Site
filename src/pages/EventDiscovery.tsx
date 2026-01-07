import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Calendar, MapPin, ExternalLink, Search, X, ArrowRight } from 'lucide-react';
import { fetchEvents, Event } from '@/lib/events';

type EventCategory = 'Trade Show' | 'Festival' | 'Conference' | 'Sports' | 'Concert' | 'Other';

const categories: EventCategory[] = ['Trade Show', 'Festival', 'Conference', 'Sports', 'Concert', 'Other'];

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const EventDiscovery: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const data = await fetchEvents();
      setEvents(data);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesCategory = selectedCategory === 'All' || event.category === selectedCategory;
      const matchesSearch = searchQuery === '' || 
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [events, selectedCategory, searchQuery]);

  return (
    <Layout>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#18448D] to-[#0f2d5c] text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">2026 Event Discovery</h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Find the perfect events to showcase your brand. Browse trade shows, festivals, conferences, and sporting events across the United States.
          </p>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="sticky top-16 z-40 bg-white border-b shadow-sm py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === 'All' ? 'default' : 'outline'}
                onClick={() => setSelectedCategory('All')}
                className={selectedCategory === 'All' ? 'bg-[#18448D] hover:bg-[#0f2d5c]' : ''}
              >
                All Events
              </Button>
              {categories.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory(cat)}
                  className={selectedCategory === cat ? 'bg-[#18448D] hover:bg-[#0f2d5c]' : ''}
                >
                  {cat}s
                </Button>
              ))}
            </div>
            
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by city or event name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Events Grid */}
      <section className="py-12 bg-slate-50">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-pulse text-lg text-gray-500">Loading events...</div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No events found. Check back soon!</p>
            </div>
          ) : (
            <>
              <p className="text-gray-600 mb-6">{filteredEvents.length} events found</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredEvents.map(event => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="bg-white rounded-xl shadow-md overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
                  >
                    <div className="relative h-48 overflow-hidden">
                      <img src={event.image_url} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      <span className="absolute top-3 left-3 bg-[#18448D] text-white text-xs font-semibold px-3 py-1 rounded-full">
                        {event.category}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-lg text-gray-900 mb-2 line-clamp-1">{event.title}</h3>
                      <div className="flex items-center text-gray-600 text-sm mb-1">
                        <MapPin className="h-4 w-4 mr-1 text-[#18448D]" />
                        {event.location}
                      </div>
                      <div className="flex items-center text-gray-600 text-sm">
                        <Calendar className="h-4 w-4 mr-1 text-[#18448D]" />
                        {formatDate(event.start_date)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto p-0">
          {selectedEvent && (
            <>
              <div className="relative h-64">
                <img src={selectedEvent.image_url} alt={selectedEvent.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-4 left-6 right-6 text-white">
                  <span className="bg-[#18448D] text-xs font-semibold px-3 py-1 rounded-full mb-2 inline-block">
                    {selectedEvent.category}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-bold">{selectedEvent.title}</h2>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-[#18448D] mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Location</p>
                      <p className="font-semibold text-gray-900">{selectedEvent.location}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-[#18448D] mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Dates</p>
                      <p className="font-semibold text-gray-900">
                        {formatDate(selectedEvent.start_date)} {selectedEvent.start_date !== selectedEvent.end_date && `- ${formatDate(selectedEvent.end_date)}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Why This Event?</h3>
                  <p className="text-gray-700">{selectedEvent.summary}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to="/design" className="flex-1">
                    <Button className="w-full bg-[#18448D] hover:bg-[#0f2d5c] text-lg py-6">
                      Create Your Banner for This Event
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <a href={selectedEvent.website} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full sm:w-auto py-6">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Official Website
                    </Button>
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default EventDiscovery;
