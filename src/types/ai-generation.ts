// AI Generation System Types

export type Tier = 'premium' | 'standard';

export type AspectRatio = '3:2' | '16:9' | '4:3' | '1:1' | '2:3';

export interface StyleOptions {
  mood?: string;
  theme?: string;
  colorScheme?: string;
}

export interface GenerationRequest {
  prompt: string;
  aspect: AspectRatio;
  style?: StyleOptions;
  userId: string;
  tier?: Tier;
}

export interface PreviewImageResponse {
  success: true;
  urls: string[];
  tier: Tier;
  cached: boolean;
  genId: string;
  cost: number;
}

export interface MoreVariationsRequest {
  genId: string;
  userId: string;
  count: number;
}

export interface MoreVariationsResponse {
  success: true;
  urls: string[];
  tier: Tier;
  cached: boolean;
  cost: number;
}

export interface FinalizeRequest {
  genId: string;
  userId: string;
  selectedUrl: string;
  bannerWidthIn: number;
  bannerHeightIn: number;
}

export interface FinalizeResponse {
  success: true;
  finalUrl: string;
  publicId: string;
  pdfUrl?: string;
}

export interface CreditsStatusResponse {
  freeRemainingToday: number;
  paidCredits: number;
  monthlySpend: number;
  monthlyCap: number;
}

export interface AddCreditsRequest {
  userId: string;
  amount: number;
  paymentId?: string;
}

export interface UsageReportResponse {
  totalGenerations: number;
  cacheHitRate: number;
  monthlySpend: number;
  tierBreakdown: {
    premium: number;
    standard: number;
  };
}

export interface Generation {
  id: string;
  user_id: string | null;
  prompt: string;
  prompt_hash: string;
  aspect: string;
  size: string;
  style: Record<string, any>;
  tier: Tier;
  image_urls: string[];
  cost_usd: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserCredits {
  user_id: string;
  credits: number;
  last_reset_date: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Selection {
  id: string;
  gen_id: string | null;
  user_id: string | null;
  selected_url: string;
  banner_w_in: number | null;
  banner_h_in: number | null;
  final_cloudinary_public_id: string | null;
  final_pdf_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UsageLog {
  id: number;
  user_id: string | null;
  event: string;
  meta: Record<string, any>;
  created_at: Date;
}
