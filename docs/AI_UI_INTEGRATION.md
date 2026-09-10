# AI UI Components - Quick Integration Guide

## Components Created

1. **CreditCounter** (`src/components/ai/CreditCounter.tsx`) - Displays user credits and monthly spend
2. **AIImageSelector** (`src/components/ai/AIImageSelector.tsx`) - Grid display of generated images
3. **AIGeneratorPanel** (`src/components/ai/AIGeneratorPanel.tsx`) - Main generation interface
4. **NewAIGenerationModal** (`src/components/design/NewAIGenerationModal.tsx`) - Modal wrapper

## Quick Integration

### Replace Existing AI Modal

In `src/pages/Design.tsx`:

```tsx
// OLD:
import AIGenerationModal from '@/components/design/AIGenerationModal';

// NEW:
import NewAIGenerationModal from '@/components/design/NewAIGenerationModal';
```

```tsx
// OLD:
<AIGenerationModal open={aiModalOpen} onOpenChange={setAiModalOpen} />

// NEW:
<NewAIGenerationModal open={aiModalOpen} onOpenChange={setAiModalOpen} />
```

## Features

- **Cost Optimization**: Caching, lazy loading, tier selection
- **Credit System**: Daily free quota + paid credits
- **Lazy Loading**: 1 image first, then 2 more on demand
- **Tier Badges**: Premium (DALL-E 3) vs Standard (Fal.ai)
- **Budget Enforcement**: Auto-downgrade when monthly cap reached

## Setup Required

1. Add environment variables to Netlify (see AI_GENERATION_SETUP.md)
2. Get Fal.ai API key from https://fal.ai
3. Run database migration: `node migrations/run-migration.js 001_ai_generation_system.sql`

## Testing

1. Open AI generation modal
2. Enter prompt and generate
3. Select image and apply to design
4. Add text layers
5. Download PDF - verify text appears

## Support

See `docs/AI_GENERATION_SETUP.md` for complete documentation.
