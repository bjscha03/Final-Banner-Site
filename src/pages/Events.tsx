import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Calendar, List, MapPin, ExternalLink, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Event, EventCategory, EventFilters } from '@/types/events';

export default function Events() {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [events, setEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<EventFilters>({
    status: 'approved',
    limit: 50,
    offset: 0
  });

  // Fetch categories
  useEffect(() => {
    fetch('/.netlify/functions/events-categories')
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  // Fetch events
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });

    console.log('Fetching events with params:', params.toString());
    fetch(`/.netlify/functions/events-list?${params}`)
      .then(res => res.json())
      .then(data => {
        console.log('Events received:', data);
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching events:', err);
        setLoading(false);
      });
  }, [filters]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatDateRange = (start: string, end?: string) => {
    if (!end || start === end) {
      return formatDate(start);
    }
    return `${formatDate(start)} - ${formatDate(end)}`;
  };


  // Group events by month for calendar view
  const groupEventsByMonth = () => {
    const grouped: { [key: string]: Event[] } = {};
    events.forEach(event => {
      const date = new Date(event.start_at);
      const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(event);
    });
    return grouped;
  };

  return (
    <>
      <Helmet>
        <title>Events - Find Your Next Banner Opportunity | Banners On The Fly</title>
        <meta name="description" content="Discover upcoming events perfect for custom banners. Food trucks, festivals, trade shows, and more. 24-hour production with free next-day air shipping." />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-[#18448D] to-blue-700 text-white py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Events Perfect for Custom Banners
              </h1>
              <p className="text-xl mb-8 text-blue-100">
                Planning one of these events? Get professional banners with 24-hour production + free next-day air shipping
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  asChild 
                  size="lg" 
                  className="bg-[#ff6b35] hover:bg-[#ff5722] text-white"
                >
                  <Link to="/events/submit">
                    <Calendar className="mr-2 h-5 w-5" />
                    Submit an Event
                  </Link>
                </Button>
                <Button 
                  asChild 
                  size="lg" 
                  variant="outline" 
                  className="bg-white text-[#18448D] hover:bg-gray-100"
                >
                  <Link to="/design">
                    Create My Banner
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and View Toggle */}
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            {/* View Toggle */}
            <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'calendar')} className="w-full md:w-auto">
              <TabsList>
                <TabsTrigger value="list">
                  <List className="mr-2 h-4 w-4" />
                  List
                </TabsTrigger>
                <TabsTrigger value="calendar">
                  <Calendar className="mr-2 h-4 w-4" />
                  Calendar
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <Select
                value={filters.category || 'all'}
                onValueChange={(value) => setFilters({ ...filters, category: value === 'all' ? undefined : value, offset: 0 })}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.slug} value={cat.slug}>
                      {cat.name} {cat.event_count ? `(${cat.event_count})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.featured ? 'featured' : 'all'}
                onValueChange={(value) => setFilters({ ...filters, featured: value === 'featured' ? true : undefined, offset: 0 })}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="featured">Featured Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Events List */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-48 w-full mb-4" />
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="mx-auto h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No events found</h3>
              <p className="text-gray-500 mb-6">Try adjusting your filters or check back later</p>
              <Button asChild>
                <Link to="/events/submit">Submit an Event</Link>
              </Button>
            </div>
          ) : view === 'calendar' ? (
            /* Calendar View */
            <div className="space-y-8">
              {Object.entries(groupEventsByMonth()).map(([month, monthEvents]) => (
                <div key={month}>
                  <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar className="h-6 w-6 text-[#18448D]" />
                    {month}
                  </h2>
                  <div className="space-y-3">
                    {monthEvents.map(event => (
                      <Card key={event.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="flex flex-col sm:flex-row">
                          <Link to={`/events/${event.slug}`} className="sm:w-48 flex-shrink-0">
                            <div className="relative h-48 sm:h-full bg-gray-200">
                              <img 
                                src={event.image_url} 
                                alt={event.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              {event.is_featured && (
                                <Badge className="absolute top-2 right-2 bg-[#ff6b35]">
                                  Featured
                                </Badge>
                              )}
                            </div>
                          </Link>
                          <div className="flex-1 p-6">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-start gap-3 mb-3">
                                  <div className="text-center bg-[#18448D] text-white rounded-lg p-3 min-w-[60px]">
                                    <div className="text-2xl font-bold">
                                      {new Date(event.start_at).getDate()}
                                    </div>
                                    <div className="text-xs uppercase">
                                      {new Date(event.start_at).toLocaleDateString('en-US', { month: 'short' })}
                                    </div>
                                  </div>
                                  <div className="flex-1">
                                    <h3 className="text-xl font-semibold mb-2">
                                      <Link to={`/events/${event.slug}`} className="hover:text-[#18448D]">
                                        {event.title}
                                      </Link>
                                    </h3>
                                    {event.category_name && (
                                      <Badge variant="outline" className="mb-2">
                                        {event.category_name}
                                      </Badge>
                                    )}
                                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                                      <Calendar className="h-4 w-4" />
                                      {formatDateRange(event.start_at, event.end_at)}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                      <MapPin className="h-4 w-4" />
                                      {event.city}, {event.state}
                                    </div>
                                  </div>
                                </div>
                                <p className="text-sm text-gray-600 line-clamp-2">
                                  {event.summary_short}
                                </p>
                              </div>
                              <div className="flex sm:flex-col gap-2">
                                <Button asChild size="sm">
                                  <Link to={`/events/${event.slug}`}>
                                    View Details
                                  </Link>
                                </Button>
                                {event.external_url && (
                                  <Button asChild size="sm" variant="outline">
                                    <a href={event.external_url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(event => (
                <Card key={event.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <Link to={`/events/${event.slug}`}>
                    <div className="relative h-48 bg-gray-200">
                      <img 
                        src={event.image_url} 
                        alt={event.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {event.is_featured && (
                        <Badge className="absolute top-2 right-2 bg-[#ff6b35]">
                          Featured
                        </Badge>
                      )}
                    </div>
                  </Link>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <CardTitle className="text-lg line-clamp-2">
                        <Link to={`/events/${event.slug}`} className="hover:text-[#18448D]">
                          {event.title}
                        </Link>
                      </CardTitle>
                    </div>
                    {event.category_name && (
                      <Badge variant="outline" className="w-fit mb-2">
                        {event.category_name}
                      </Badge>
                    )}
                    <CardDescription className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4" />
                      {formatDateRange(event.start_at, event.end_at)}
                    </CardDescription>
                    <CardDescription className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4" />
                      {event.city}, {event.state}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                      {event.summary_short}
                    </p>
                    <div className="flex gap-2">
                      <Button asChild size="sm" className="flex-1">
                        <Link to={`/events/${event.slug}`}>
                          View Details
                        </Link>
                      </Button>
                      {event.external_url && (
                        <Button asChild size="sm" variant="outline">
                          <a href={event.external_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
