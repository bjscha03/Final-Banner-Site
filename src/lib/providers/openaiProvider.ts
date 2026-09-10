import OpenAI from 'openai';
import type { AIProvider, GenerateImageRequest, GenerateImageResponse } from './types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ASPECT_TO_SIZE_MAP: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
  '1:1': '1024x1024',
  '4:3': '1024x1024',
  '3:2': '1792x1024',
  '16:9': '1792x1024',
  '2:3': '1024x1792',
};

export const openaiProvider: AIProvider = {
  name: 'OpenAI DALL-E 3',
  costPerImage: 0.080,

  async generate(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    const size = ASPECT_TO_SIZE_MAP[request.aspect] || '1792x1024';
    const quality = (process.env.DALLE_QUALITY as 'hd' | 'standard') || 'hd';

    console.log(`[OpenAI] Generating: ${request.prompt.substring(0, 50)}...`);

    try {
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: request.prompt,
        n: 1,
        size,
        quality,
        response_format: 'url',
      });

      const imageUrl = response.data[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL in OpenAI response');
      }

      console.log(`[OpenAI] Success`);

      return {
        url: imageUrl,
        revisedPrompt: response.data[0]?.revised_prompt,
      };
    } catch (error: any) {
      console.error('[OpenAI] Error:', error);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  },
};
