import type { AIProvider, GenerateImageRequest, GenerateImageResponse } from './types';

const FAL_API_KEY = process.env.FAL_API_KEY;
const FAL_MODEL = process.env.STANDARD_MODEL || 'fal-ai/flux-schnell';

const ASPECT_TO_FAL_MAP: Record<string, string> = {
  '1:1': 'square',
  '4:3': 'square',
  '3:2': 'landscape_16_9',
  '16:9': 'landscape_16_9',
  '2:3': 'portrait_16_9',
};

export const falProvider: AIProvider = {
  name: 'Fal.ai Flux Schnell',
  costPerImage: 0.003,

  async generate(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY not configured');
    }

    const aspectRatio = ASPECT_TO_FAL_MAP[request.aspect] || 'landscape_16_9';

    console.log(`[Fal.ai] Generating: ${request.prompt.substring(0, 50)}...`);

    try {
      const response = await fetch(`https://fal.run/${FAL_MODEL}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          image_size: aspectRatio,
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      const imageUrl = data.images?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL in Fal.ai response');
      }

      console.log(`[Fal.ai] Success`);

      return {
        url: imageUrl,
      };
    } catch (error: any) {
      console.error('[Fal.ai] Error:', error);
      throw new Error(`Fal.ai generation failed: ${error.message}`);
    }
  },
};
