import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Calendar, Send, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { EventCategory, EventSubmission } from '@/types/events';

export default function EventSubmit() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<EventSubmission>({
    title: '',
    category_slug: '',
    external_url: '',
    image_url: '',
    venue: '',
    city: '',
    state: '',
    start_at: '',
    end_at: '',
    description: '',
    submitter_email: ''
  });

  useEffect(() => {
    fetch('/.netlify/functions/events-categories')
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/.netlify/functions/events-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit event');
      }

      setSubmitted(true);
      toast({
        title: 'Event Submitted!',
        description: 'Your event has been submitted and is pending approval.',
      });

    } catch (error: any) {
      toast({
        title: 'Submission Failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof EventSubmission, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (submitted) {
    return (
      <>
        <Helmet>
          <title>Event Submitted | Banners On The Fly</title>
        </Helmet>

        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl">Event Submitted Successfully!</CardTitle>
              <CardDescription>
                Thank you for submitting your event. Our team will review it and publish it shortly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-700">
                  While you wait, why not design a custom banner for your event? We offer 24-hour production with free next-day air shipping!
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link to="/design">Create My Banner</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/events">Browse Events</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Submit an Event | Banners On The Fly</title>
        <meta name="description" content="Submit your event to be featured on Banners On The Fly. Help others discover great banner opportunities!" />
      </Helmet>

      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Submit an Event</h1>
            <p className="text-lg text-gray-600">
              Know of an event perfect for custom banners? Share it with our community!
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
              <CardDescription>
                All submissions are reviewed before being published. Fields marked with * are required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Event Title *</Label>
                  <Input
                    id="title"
                    required
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="Summer Food Truck Festival 2025"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    required
                    value={formData.category_slug}
                    onValueChange={(value) => handleChange('category_slug', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.slug} value={cat.slug}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_at">Start Date & Time *</Label>
                    <Input
                      id="start_at"
                      type="datetime-local"
                      required
                      value={formData.start_at}
                      onChange={(e) => handleChange('start_at', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_at">End Date & Time</Label>
                    <Input
                      id="end_at"
                      type="datetime-local"
                      value={formData.end_at}
                      onChange={(e) => handleChange('end_at', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="venue">Venue Name</Label>
                  <Input
                    id="venue"
                    value={formData.venue}
                    onChange={(e) => handleChange('venue', e.target.value)}
                    placeholder="Central Park"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      required
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      placeholder="New York"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      required
                      value={formData.state}
                      onChange={(e) => handleChange('state', e.target.value)}
                      placeholder="NY"
                      maxLength={2}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="external_url">Official Event Website</Label>
                  <Input
                    id="external_url"
                    type="url"
                    value={formData.external_url}
                    onChange={(e) => handleChange('external_url', e.target.value)}
                    placeholder="https://example.com/event"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image_url">Event Image URL</Label>
                  <Input
                    id="image_url"
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => handleChange('image_url', e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                  <p className="text-sm text-gray-500">
                    Provide a URL to an event image (will be optimized automatically)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Event Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Tell us about this event..."
                    rows={4}
                  />
                  <p className="text-sm text-gray-500">
                    Optional - we'll generate a summary if you leave this blank
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="submitter_email">Your Email *</Label>
                  <Input
                    id="submitter_email"
                    type="email"
                    required
                    value={formData.submitter_email}
                    onChange={(e) => handleChange('submitter_email', e.target.value)}
                    placeholder="you@example.com"
                  />
                  <p className="text-sm text-gray-500">
                    We'll contact you if we need more information
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? (
                      'Submitting...'
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Event
                      </>
                    )}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    asChild
                  >
                    <Link to="/events">Cancel</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
