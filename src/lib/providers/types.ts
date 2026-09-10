import type { AspectRatio, StyleOptions } from '@/types/ai-generation';

export interface GenerateImageRequest {
  prompt: string;
  aspect: AspectRatio;
  style?: StyleOptions;
  size?: string;
}

export interface GenerateImageResponse {
  url: string;
  revisedPrompt?: string;
}

export interface AIProvider {
  name: string;
  costPerImage: number;
  generate(request: GenerateImageRequest): Promise<GenerateImageResponse>;
}
