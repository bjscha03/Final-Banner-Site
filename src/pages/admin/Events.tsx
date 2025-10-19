import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, X, Trash2, Upload, Download, ExternalLink, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Event } from '@/types/events';

export default function AdminEvents() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'ingest'>('pending');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [ingestData, setIngestData] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestResults, setIngestResults] = useState<any>(null);

  useEffect(() => {
    if (activeTab === 'ingest') return;
    fetchEvents(activeTab);
  }, [activeTab, searchTerm]);

  const fetchEvents = async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        limit: '100',
        ...(searchTerm && { search: searchTerm })
      });

      const response = await fetch(`/.netlify/functions/admin-events?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || 'admin'}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch events');

      const data = await response.json();
      setEvents(data.events || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateEventStatus = async (eventId: string, status: 'approved' | 'rejected') => {
    try {
      const response = await fetch(`/.netlify/functions/admin-events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || 'admin'}`
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) throw new Error('Failed to update event');

      toast({
        title: 'Success',
        description: `Event ${status}`,
      });

      fetchEvents(activeTab);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const toggleFeatured = async (eventId: string, currentFeatured: boolean) => {
    try {
      const response = await fetch(`/.netlify/functions/admin-events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || 'admin'}`
        },
        body: JSON.stringify({ is_featured: !currentFeatured })
      });

      if (!response.ok) throw new Error('Failed to update event');

      toast({
        title: 'Success',
        description: `Event ${!currentFeatured ? 'featured' : 'unfeatured'}`,
      });

      fetchEvents(activeTab);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const response = await fetch(`/.netlify/functions/admin-events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || 'admin'}`
        }
      });

      if (!response.ok) throw new Error('Failed to delete event');

      toast({
        title: 'Success',
        description: 'Event deleted',
      });

      fetchEvents(activeTab);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleBulkIngest = async () => {
    setIngestLoading(true);
    setIngestResults(null);

    try {
      const eventsData = JSON.parse(ingestData);
      
      if (!Array.isArray(eventsData)) {
        throw new Error('Input must be a JSON array of events');
      }

      const response = await fetch('/.netlify/functions/admin-events-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || 'admin'}`
        },
        body: JSON.stringify({
          events: eventsData,
          dry_run: dryRun,
          upsert: true
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ingest failed');
      }

      const results = await response.json();
      setIngestResults(results);

      toast({
        title: dryRun ? 'Dry Run Complete' : 'Ingest Complete',
        description: `${results.results.inserted} inserted, ${results.results.updated} updated, ${results.results.skipped} skipped`,
      });

    } catch (error: any) {
      toast({
        title: 'Ingest Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIngestLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <>
      <Helmet>
        <title>Admin - Events Management | Banners On The Fly</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Events Management</h1>
            <p className="text-gray-600">Manage event submissions and bulk import events</p>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="mb-6">
              <TabsTrigger value="pending">
                Pending
                {events.length > 0 && activeTab === 'pending' && (
                  <Badge variant="secondary" className="ml-2">{events.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="ingest">
                <Upload className="mr-2 h-4 w-4" />
                Bulk Ingest
              </TabsTrigger>
            </TabsList>

            {['pending', 'approved', 'rejected'].map(status => (
              <TabsContent key={status} value={status}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="capitalize">{status} Events</CardTitle>
                        <CardDescription>
                          {status === 'pending' && 'Review and approve/reject event submissions'}
                          {status === 'approved' && 'Published events visible to users'}
                          {status === 'rejected' && 'Rejected event submissions'}
                        </CardDescription>
                      </div>
                      <Input
                        placeholder="Search events..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-xs"
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="text-center py-8">Loading...</div>
                    ) : events.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No {status} events found
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Submitted By</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {events.map(event => (
                            <TableRow key={event.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {event.is_featured && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                                  <Link 
                                    to={`/events/${event.slug}`} 
                                    target="_blank"
                                    className="font-medium hover:text-[#18448D]"
                                  >
                                    {event.title}
                                  </Link>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{event.category_name}</Badge>
                              </TableCell>
                              <TableCell>{event.city}, {event.state}</TableCell>
                              <TableCell>{formatDate(event.start_at)}</TableCell>
                              <TableCell className="text-sm text-gray-600">{event.created_by}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {status === 'approved' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => toggleFeatured(event.id, event.is_featured)}
                                      title={event.is_featured ? 'Unfeature' : 'Feature'}
                                    >
                                      <Star className={`h-4 w-4 ${event.is_featured ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                                    </Button>
                                  )}
                                  {status === 'pending' && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => updateEventStatus(event.id, 'approved')}
                                        title="Approve"
                                      >
                                        <Check className="h-4 w-4 text-green-600" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => updateEventStatus(event.id, 'rejected')}
                                        title="Reject"
                                      >
                                        <X className="h-4 w-4 text-red-600" />
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deleteEvent(event.id)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4 text-gray-600" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    asChild
                                    title="Preview"
                                  >
                                    <Link to={`/events/${event.slug}`} target="_blank">
                                      <ExternalLink className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}

            <TabsContent value="ingest">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Bulk Import Events</CardTitle>
                    <CardDescription>
                      Import multiple events from JSON. Paste your JSON array below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="ingest-data">Event Data (JSON Array)</Label>
                      <Textarea
                        id="ingest-data"
                        value={ingestData}
                        onChange={(e) => setIngestData(e.target.value)}
                        placeholder='[{"title": "Event Name", "category_slug": "food-trucks", "city": "New York", "state": "NY", "start_at": "2025-07-15T10:00:00Z", ...}]'
                        rows={15}
                        className="font-mono text-sm"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="dry-run"
                        checked={dryRun}
                        onCheckedChange={setDryRun}
                      />
                      <Label htmlFor="dry-run">
                        Dry Run (validate without inserting)
                      </Label>
                    </div>

                    <Button
                      onClick={handleBulkIngest}
                      disabled={ingestLoading || !ingestData.trim()}
                      className="w-full"
                    >
                      {ingestLoading ? 'Processing...' : (dryRun ? 'Validate Data' : 'Import Events')}
                    </Button>
                  </CardContent>
                </Card>

                {ingestResults && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Ingest Results</CardTitle>
                      <CardDescription>
                        {ingestResults.dry_run ? 'Validation results (no changes made)' : 'Import completed'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-blue-700">{ingestResults.results.total}</div>
                          <div className="text-sm text-gray-600">Total Events</div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-green-700">{ingestResults.results.inserted}</div>
                          <div className="text-sm text-gray-600">Inserted</div>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-700">{ingestResults.results.updated}</div>
                          <div className="text-sm text-gray-600">Updated</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-gray-700">{ingestResults.results.skipped}</div>
                          <div className="text-sm text-gray-600">Skipped</div>
                        </div>
                      </div>

                      {ingestResults.results.errors.length > 0 && (
                        <div className="bg-red-50 p-4 rounded-lg">
                          <h4 className="font-semibold text-red-700 mb-2">Errors</h4>
                          <ul className="text-sm text-red-600 space-y-1">
                            {ingestResults.results.errors.map((error: string, i: number) => (
                              <li key={i}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
