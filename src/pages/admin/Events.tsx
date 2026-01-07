import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { fetchEvents, deleteEvent, deleteAllEvents, insertEvents, Event } from '@/lib/events';
import { Upload, Trash2, ArrowLeft, Download, RefreshCw } from 'lucide-react';

const AdminEvents: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin(user))) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const data = await fetchEvents();
      setEvents(data);
    } catch (err) {
      console.error('Error fetching events:', err);
      toast({ title: 'Error', description: 'Failed to fetch events', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const parseCSV = (text: string): Partial<Event>[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows: Partial<Event>[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      const row: any = {};
      headers.forEach((header, idx) => {
        let key = header;
        if (header === 'image_url' || header === 'imageurl' || header === 'image') key = 'image_url';
        if (header === 'start_date' || header === 'startdate' || header === 'start') key = 'start_date';
        if (header === 'end_date' || header === 'enddate' || header === 'end') key = 'end_date';
        row[key] = values[idx] || '';
      });
      
      if (row.title) rows.push(row);
    }
    
    return rows;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    
    try {
      const text = await file.text();
      const parsedEvents = parseCSV(text);
      
      if (parsedEvents.length === 0) {
        throw new Error('No valid events found in CSV');
      }
      
      // Delete all existing events
      await deleteAllEvents();
      
      // Insert new events
      const eventsToInsert = parsedEvents.map(e => ({
        title: e.title || '',
        category: e.category || 'Other',
        location: e.location || '',
        start_date: e.start_date || new Date().toISOString().split('T')[0],
        end_date: e.end_date || e.start_date || new Date().toISOString().split('T')[0],
        summary: e.summary || '',
        website: e.website || '',
        image_url: e.image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80'
      }));
      
      const success = await insertEvents(eventsToInsert);
      
      if (!success) throw new Error('Failed to insert events');
      
      toast({ title: 'Success', description: `Imported ${parsedEvents.length} events` });
      loadEvents();
    } catch (err: any) {
      console.error('Error uploading CSV:', err);
      toast({ title: 'Error', description: err.message || 'Failed to import CSV', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const success = await deleteEvent(id);
      if (!success) throw new Error('Delete failed');
      setEvents(events.filter(e => e.id !== id));
      toast({ title: 'Deleted', description: 'Event removed' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete event', variant: 'destructive' });
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL events? This cannot be undone.')) return;
    try {
      const success = await deleteAllEvents();
      if (!success) throw new Error('Delete failed');
      setEvents([]);
      toast({ title: 'Deleted', description: 'All events removed' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete events', variant: 'destructive' });
    }
  };

  const downloadTemplate = () => {
    const csv = 'ID,Title,Category,Location,Start Date,End Date,Summary,Website,Image URL\n' +
      ',CES 2026,Trade Show,"Las Vegas, NV",2026-01-06,2026-01-09,"The world\'s largest consumer electronics show.",https://ces.tech,https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'events_template.csv';
    a.click();
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#18448D] text-white py-4 px-6">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/orders')} className="text-white hover:bg-white/20">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <h1 className="text-xl font-bold">Events Management</h1>
          </div>
          <span className="text-sm">{events.length} events</span>
        </div>
      </div>

      <div className="container mx-auto py-8 px-4">
        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Upload Events CSV</h2>
          <p className="text-gray-600 text-sm mb-4">
            Upload a CSV file with columns: ID, Title, Category, Location, Start Date, End Date, Summary, Website, Image URL. 
            This will <strong>replace all existing events</strong>.
          </p>
          <div className="flex flex-wrap gap-3">
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-[#18448D] hover:bg-[#0f2d5c]">
              <Upload className="h-4 w-4 mr-2" /> {uploading ? 'Uploading...' : 'Upload CSV'}
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" /> Download Template
            </Button>
            <Button variant="outline" onClick={loadEvents}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete All
            </Button>
          </div>
        </div>

        {/* Events Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Event</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Location</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Dates</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-500">No events. Upload a CSV to get started.</td></tr>
                ) : (
                  events.map(event => (
                    <tr key={event.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img src={event.image_url} alt="" className="w-12 h-12 rounded object-cover" />
                          <div>
                            <p className="font-medium text-gray-900 line-clamp-1">{event.title}</p>
                            <a href={event.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Website</a>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4"><span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">{event.category}</span></td>
                      <td className="py-3 px-4 text-sm text-gray-600">{event.location}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{event.start_date} - {event.end_date}</td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteEvent(event.id)} className="text-red-600 hover:text-red-800 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminEvents;
