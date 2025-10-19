import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Calendar, MapPin, ExternalLink, ArrowRight, Clock, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import type { Event } from '@/types/events';

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to parse PostgreSQL array string
  const parsePopularSizes = (sizesStr?: string): string[] => {
    if (!sizesStr) return [];
    try {
      // PostgreSQL returns arrays as strings like: {"96x36","72x24"}
      return sizesStr.replace(/[{}]/g, '').split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (!slug) return;

    setLoading(true);
    fetch(`/.netlify/functions/events-get/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Event not found');
        return res.json();
      })
      .then(data => {
        setEvent(data.event);
        setRelatedEvents(data.relatedEvents || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching event:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-96 w-full mb-8" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Event Not Found</h1>
          <p className="text-gray-600 mb-8">The event you're looking for doesn't exist or has been removed.</p>
          <Button asChild>
            <Link to="/events">Browse All Events</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Generate JSON-LD structured data for SEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": event.title,
    "description": event.summary_short,
    "startDate": event.start_at,
    "endDate": event.end_at || event.start_at,
    "location": {
      "@type": "Place",
      "name": event.venue || `${event.city}, ${event.state}`,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": event.city,
        "addressRegion": event.state,
        "addressCountry": event.country
      }
    },
    "image": event.image_url,
    "url": event.external_url || `https://bannersonthefly.com/events/${event.slug}`
  };

  return (
    <>
      <Helmet>
        <title>{event.title} | Events | Banners On The Fly</title>
        <meta name="description" content={event.summary_short} />
        <meta property="og:title" content={event.title} />
        <meta property="og:description" content={event.summary_short} />
        <meta property="og:image" content={event.image_url} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`https://bannersonthefly.com/events/${event.slug}`} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Hero Image */}
        <div className="relative h-96 bg-gray-900">
          <img 
            src={event.image_url} 
            alt={event.title}
            className="w-full h-full object-cover opacity-80"
          />
          {event.is_featured && (
            <Badge className="absolute top-4 right-4 bg-[#ff6b35] text-white text-lg px-4 py-2">
              Featured Event
            </Badge>
          )}
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-sm p-8">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">{event.title}</h1>
                
                {event.category_name && (
                  <Badge variant="outline" className="mb-4">
                    <Tag className="mr-1 h-3 w-3" />
                    {event.category_name}
                  </Badge>
                )}

                <div className="flex flex-col gap-3 mb-6 text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-[#18448D]" />
                    <span className="font-medium">{formatDate(event.start_at)}</span>
                    {event.end_at && event.end_at !== event.start_at && (
                      <span> - {formatDate(event.end_at)}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-[#18448D]" />
                    <span>{formatTime(event.start_at)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-[#18448D]" />
                    <span>
                      {event.venue && `${event.venue}, `}
                      {event.city}, {event.state}
                    </span>
                  </div>
                </div>

                <Separator className="my-6" />

                <div className="prose max-w-none">
                  <h2 className="text-2xl font-semibold mb-4">About This Event</h2>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                    {event.summary_short}
                  </p>
                  {event.description && (
                    <p className="text-gray-700 leading-relaxed mt-4 whitespace-pre-line">
                      {event.description}
                    </p>
                  )}
                </div>

                <Separator className="my-6" />

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    asChild 
                    size="lg" 
                    className="flex-1 bg-[#18448D] hover:bg-blue-700"
                  >
                    <Link to={`/design?event=${event.slug}&category=${event.category_slug}`}>
                      Create My Banner for This Event
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  
                  {event.external_url && (
                    <Button 
                      asChild 
                      size="lg" 
                      variant="outline"
                      className="flex-1"
                    >
                      <a href={event.external_url} target="_blank" rel="noopener noreferrer">
                        Official Event Website
                        <ExternalLink className="ml-2 h-5 w-5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Quick Facts */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Quick Facts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {event.recommended_material && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600 mb-1">Recommended Material</h4>
                      <p className="text-gray-900">{event.recommended_material}</p>
                    </div>
                  )}
                  
                  {(() => {
                    const sizes = parsePopularSizes(event.popular_sizes);
                    return sizes.length > 0 ? (
                      <div>
                        <h4 className="font-semibold text-sm text-gray-600 mb-2">Popular Sizes</h4>
                        <div className="flex flex-wrap gap-2">
                          {sizes.map(size => (
                            <Badge key={size} variant="secondary">{size}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  <Separator />

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-[#18448D] mb-2">24-Hour Production</h4>
                    <p className="text-sm text-gray-700">
                      Get your custom banners with free next-day air shipping. Perfect for last-minute event needs!
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Related Events */}
              {relatedEvents.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Related Events</CardTitle>
                    <CardDescription>More {event.category_name} events</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {relatedEvents.map(related => (
                      <Link 
                        key={related.id} 
                        to={`/events/${related.slug}`}
                        className="block hover:bg-gray-50 p-3 rounded-lg transition-colors"
                      >
                        <h4 className="font-semibold text-sm mb-1 line-clamp-2">{related.title}</h4>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(related.start_at)}
                        </p>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {related.city}, {related.state}
                        </p>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
