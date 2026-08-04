export type CreateWithAIProductType = 'banner' | 'yard_sign' | 'car_magnet';

export type ExactCopy = {
  headline: string;
  supportingText: string;
  offer: string;
  callToAction: string;
  businessName: string;
  phone: string;
  website: string;
  address: string;
  date: string;
  other: string;
};

export type CreativeBrief = {
  structured: boolean;
  description: string;
  purpose: string;
  targetAudience: string;
  primaryMessage: string;
  visualStyle: string;
  brandPersonality: string;
  colorPalette: string;
  subjectMatter: string;
  composition: string;
  focalPoint: string;
  usage: string;
  viewingDistance: string;
  widthIn: number;
  heightIn: number;
  material: string;
  quantity: number;
  productType: CreateWithAIProductType;
  textPosition: 'left' | 'center' | 'right';
  logoPosition: 'upper-left' | 'upper-right' | 'lower-left' | 'lower-right';
  textColor: string;
  accentColor: string;
  copy: ExactCopy;
};

export type AIValidation = {
  status: 'passed' | 'failed';
  passed: boolean;
  reasons: string[];
  checks: {
    dimensions: { passed: boolean; width: number; height: number; expectedWidth: number; expectedHeight: number };
    aspectRatio: { passed: boolean; requested: number; actual: number };
    edgeCoverage: { passed: boolean; suspiciousEdges: string[] };
    resolution: { passed: boolean; effectivePpi: number; minimumPpi: number };
    flatArtwork: { passed: boolean; flags: string[]; confidence: number };
    exactText: { passed: boolean; required: string[]; detected: string[] };
  };
  vision: { available: boolean; model: string; requestId: string | null };
};

export type AIConcept = {
  id: string;
  versionId: string;
  generationId: string;
  backgroundRef: string;
  imageBase64: string;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  widthIn: number;
  heightIn: number;
  aspectRatio: number;
  validation: AIValidation;
  printReady: boolean;
  textLayers: Array<Record<string, unknown>>;
  logoLayer: Record<string, unknown> | null;
  diagnostics: {
    model: string;
    modelSnapshot: string | null;
    providerRequestId: string | null;
    durationMs: number;
    outputDimensions: string;
    requestedAspectRatio: number;
    finalAspectRatio: number;
    ratioStrategy: string;
    repaired: boolean;
    estimatedCostUsd: number | null;
  };
};

export type AIDesignSession = {
  generationId: string;
  brief: CreativeBrief;
  selectedConcept: AIConcept;
  referenceImage: string | null;
  logoImage: string | null;
  versionHistory: AIConcept[];
};

export interface CreateWithAIResult {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
  fileName: string;
  prompt: string;
  session: AIDesignSession;
}
