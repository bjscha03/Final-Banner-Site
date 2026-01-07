import { db } from '@/lib/neon/client';

export interface Event {
  id: string;
  title: string;
  category: string;
  location: string;
  start_date: string;
  end_date: string;
  summary: string;
  website: string;
  image_url: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchEvents(): Promise<Event[]> {
  if (!db) {
    console.warn('Database not configured, returning empty events list');
    return [];
  }

  try {
    const events = await db`
      SELECT id, title, category, location, start_date, end_date, summary, website, image_url, created_at, updated_at
      FROM events
      ORDER BY start_date ASC
    `;
    return events as Event[];
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
}

export async function deleteEvent(id: string): Promise<boolean> {
  if (!db) return false;
  
  try {
    await db`DELETE FROM events WHERE id = ${id}`;
    return true;
  } catch (error) {
    console.error('Error deleting event:', error);
    return false;
  }
}

export async function deleteAllEvents(): Promise<boolean> {
  if (!db) return false;
  
  try {
    await db`DELETE FROM events`;
    return true;
  } catch (error) {
    console.error('Error deleting all events:', error);
    return false;
  }
}

export async function insertEvents(events: Omit<Event, 'id' | 'created_at' | 'updated_at'>[]): Promise<boolean> {
  if (!db) return false;
  
  try {
    for (const event of events) {
      await db`
        INSERT INTO events (title, category, location, start_date, end_date, summary, website, image_url)
        VALUES (${event.title}, ${event.category}, ${event.location}, ${event.start_date}, ${event.end_date}, ${event.summary}, ${event.website}, ${event.image_url})
      `;
    }
    return true;
  } catch (error) {
    console.error('Error inserting events:', error);
    return false;
  }
}
