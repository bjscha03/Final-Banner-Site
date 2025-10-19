/**
 * TypeScript types for Events System v2
 */

export interface EventCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  event_count?: number;
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  summary_short?: string;
  description?: string;
  external_url?: string;
  image_url?: string;
  venue?: string;
  city: string;
  state: string;
  start_at: string;
  end_at?: string;
  recommended_material?: string;
  popular_sizes?: string;
  is_featured: boolean;
  status: 'pending' | 'approved' | 'rejected';
  category_id?: number;
  category_name?: string;
  category_slug?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EventFilters {
  status?: 'pending' | 'approved' | 'rejected';
  category?: string;
  city?: string;
  state?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
  format?: 'list' | 'calendar';
  search?: string;
}

export interface EventSubmission {
  title: string;
  category_slug: string;
  external_url?: string;
  image_url?: string;
  venue?: string;
  city: string;
  state: string;
  start_at: string;
  end_at?: string;
  description?: string;
  submitter_email: string;
}

export interface BulkIngestRequest {
  events: Partial<Event>[];
  dry_run?: boolean;
  upsert?: boolean;
}

export interface BulkIngestResponse {
  success: boolean;
  dry_run: boolean;
  results: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: string[];
  };
  normalized_events: Event[];
}
