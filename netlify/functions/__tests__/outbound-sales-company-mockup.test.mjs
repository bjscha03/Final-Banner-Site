import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import researchModule from '../_shared/outbound-sales/research.cjs';
import mockupModule from '../_shared/outbound-sales/company-mockup.cjs';
import migration31 from '../../../migrations/031_outbound_company_banner_mockups.sql?raw';
import rollback31 from '../../../migrations/031_outbound_company_banner_mockups.rollback.sql?raw';

const PROSPECT_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function candidateFixture() {
  return {
    prospect: {
      id: PROSPECT_ID,
      businessName: 'Amberjack',
      websiteUrl: 'https://amberjack.example',
      canonicalDomain: 'amberjack.example',
      industry: 'Footwear',
      businessType: 'Retail brand',
      qualificationEvidence: [{ code: 'trade_show', evidence: 'Amberjack is exhibiting at the Atlanta Shoe Market.' }],
    },
    research: {
      contentHash: 'research-hash-1',
      sourceUrls: ['https://amberjack.example'],
      evidence: [],
      bannerNeedSignals: [],
      extractedFacts: {
        brandAssets: {
          logoCandidates: [{ url: 'https://amberjack.example/logo.png', kind: 'logo', score: 120 }],
          imageCandidates: [{ url: 'https://amberjack.example/shoe.jpg', kind: 'product', score: 110 }],
        },
      },
    },
    message: {
      id: MESSAGE_ID,
      subject: 'Amberjack at Atlanta Shoe Market',
      bodyText: 'Hi Eric,\n\nI saw Amberjack is exhibiting at the Atlanta Shoe Market on August 15–17.\n\nBest,\nBrandon',
    },
    mockup: null,
  };
}

async function imageFixtures() {
  const scene = await sharp({ create: { width: 1200, height: 675, channels: 3, background: '#d9dee7' } }).jpeg().toBuffer();
  const logo = await sharp({ create: { width: 420, height: 140, channels: 4, background: '#ff6b35' } }).png().toBuffer();
  const noise = Buffer.alloc(800 * 600 * 3);
  for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 47 + Math.floor(index / 97) * 31) % 256;
  const product = await sharp(noise, { raw: { width: 800, height: 600, channels: 3 } }).jpeg().toBuffer();
  return { scene, logo, product };
}

describe('company-brand asset extraction', () => {
  it('ranks exact logo metadata and real product imagery without inventing brand assets', () => {
    const html = `
      <meta property="og:image" content="/products/featured-shoe.jpg">
      <script type="application/ld+json">{"logo":"https://cdn.amberjack.example/logo.png"}</script>
      <img class="site-logo" src="/assets/amberjack-logo.webp" alt="Amberjack logo" width="420" height="120">
      <img class="featured-product" src="/products/loafer.jpg" alt="Amberjack loafer" width="900" height="700">
      <img src="/icons/cart.png" width="24" height="24">
    `;
    const assets = researchModule.extractBrandAssets(html, 'https://amberjack.example/');
    expect(assets.logoCandidates.map((asset) => asset.url)).toContain('https://cdn.amberjack.example/logo.png');
    expect(assets.logoCandidates.map((asset) => asset.url)).toContain('https://amberjack.example/assets/amberjack-logo.webp');
    expect(assets.imageCandidates[0].url).toBe('https://amberjack.example/products/featured-shoe.jpg');
    expect(assets.imageCandidates.map((asset) => asset.url)).not.toContain('https://amberjack.example/icons/cart.png');
  });

  it('rejects SVG assets that can load scripts, remote files, or embedded foreign content', () => {
    expect(() => mockupModule.safeSvg(Buffer.from('<svg><script>alert(1)</script></svg>'))).toThrow(/unsafe/i);
    expect(() => mockupModule.safeSvg(Buffer.from('<svg><image href="https://private.example/a.png"/></svg>'))).toThrow(/unsafe/i);
    expect(() => mockupModule.safeSvg(Buffer.from('<svg><style>@import "https://private.example/a.css"</style></svg>'))).toThrow(/unsafe/i);
    expect(mockupModule.safeSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>'))).toBeInstanceOf(Buffer);
  });
});

describe('deterministic personalized banner renderer', () => {
  it('selects the trade-show scene and exact event from grounded message copy', () => {
    const candidate = candidateFixture();
    expect(mockupModule.selectSceneId(candidate)).toBe('trade_show');
    expect(mockupModule.eventLabel(candidate)).toBe('Atlanta Shoe Market');
    const wrongShow = candidateFixture();
    wrongShow.message.bodyText = 'Amberjack is exhibiting at the Wrong Company Expo on August 15.';
    expect(mockupModule.eventLabel(wrongShow)).toBeNull();

    const codeOnly = candidateFixture();
    codeOnly.prospect.qualificationEvidence = [{ code: 'trade_show', evidence: 'Listed for Atlanta Shoe Market.' }];
    codeOnly.message.bodyText = 'A custom banner concept for Amberjack.';
    expect(mockupModule.selectSceneId(codeOnly)).toBe('trade_show');
  });

  it('renders a valid 1200x675 email-safe JPEG with exact company assets', async () => {
    const { scene, logo, product } = await imageFixtures();
    const result = await mockupModule.renderCompanyMockup(candidateFixture(), {
      logo: { buffer: logo, finalUrl: 'https://amberjack.example/logo.png', candidate: { url: 'https://amberjack.example/logo.png' } },
      product: { buffer: product, finalUrl: 'https://amberjack.example/shoe.jpg', candidate: { url: 'https://amberjack.example/shoe.jpg' } },
    }, {
      sharp,
      sceneBuffers: { trade_show: scene, storefront: scene, community_event: scene },
    });
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 1200, height: 675 });
    expect(result.plan).toMatchObject({
      sceneId: 'trade_show',
      eventLabel: 'Atlanta Shoe Market',
      logoUrl: 'https://amberjack.example/logo.png',
      productImageUrl: 'https://amberjack.example/shoe.jpg',
    });
    expect(result.buffer.length).toBeLessThan(2 * 1024 * 1024);
  });

  it('prepares and caches a full brand match while retaining a name-only fallback path', async () => {
    const candidate = candidateFixture();
    const { scene, logo, product } = await imageFixtures();
    const store = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) };
    const saveCompanyMockup = vi.fn().mockImplementation(async (_sql, value) => ({ ...value, id: 'mockup-1' }));
    const result = await mockupModule.prepareCompanyMockup({
      sql: vi.fn(),
      prospectId: PROSPECT_ID,
      store,
      sharp,
      dependencies: {
        loadCompanyMockupCandidate: vi.fn().mockResolvedValue(candidate),
        saveCompanyMockup,
        fetchAsset: vi.fn().mockImplementation(async (url) => ({
          finalUrl: url,
          contentType: url.endsWith('.png') ? 'image/png' : 'image/jpeg',
          body: url.endsWith('.png') ? logo : product,
        })),
        sceneBuffers: { trade_show: scene, storefront: scene, community_event: scene },
      },
    });
    expect(result.qualityLevel).toBe('logo_and_product');
    expect(store.set).toHaveBeenCalledOnce();
    expect(saveCompanyMockup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'ready', qualityLevel: 'logo_and_product', logoUrl: 'https://amberjack.example/logo.png',
      productImageUrl: 'https://amberjack.example/shoe.jpg',
    }));
    const attachment = mockupModule.attachmentFromMockup(result, candidate.prospect.businessName);
    expect(attachment).toMatchObject({ filename: 'amberjack-banner-concept.jpg', contentId: 'company-banner-mockup', contentType: 'image/jpeg' });
    expect(Buffer.from(attachment.content, 'base64').length).toBe(result.buffer.length);
    expect(mockupModule.qualityLevel(null, null)).toBe('name_only');
  });

  it('rejects tiny or flat assets and renders a clean fallback instead of mailing a poor image', async () => {
    const candidate = candidateFixture();
    const { scene } = await imageFixtures();
    const tinyLogo = await sharp({ create: { width: 60, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const flatProduct = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();
    const saveCompanyMockup = vi.fn().mockImplementation(async (_sql, value) => ({ ...value, id: 'mockup-fallback' }));
    const result = await mockupModule.prepareCompanyMockup({
      sql: vi.fn(), prospectId: PROSPECT_ID, sharp,
      dependencies: {
        loadCompanyMockupCandidate: vi.fn().mockResolvedValue(candidate),
        saveCompanyMockup,
        fetchAsset: vi.fn().mockImplementation(async (url) => ({
          finalUrl: url, contentType: url.endsWith('.png') ? 'image/png' : 'image/jpeg',
          body: url.endsWith('.png') ? tinyLogo : flatProduct,
        })),
        sceneBuffers: { trade_show: scene, storefront: scene, community_event: scene },
      },
    });
    expect(result.qualityLevel).toBe('name_only');
    expect(saveCompanyMockup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'fallback', logoUrl: null, productImageUrl: null, qualityLevel: 'name_only',
    }));
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 1200, height: 675, format: 'jpeg' });
  });
});

describe('company mockup migration isolation', () => {
  it('stores metadata only in a dedicated outbound table and has a clean rollback', () => {
    expect(migration31).toContain('CREATE TABLE IF NOT EXISTS outbound_company_mockups');
    expect(migration31).toContain("'logo_and_product'");
    expect(migration31).toContain('Raster bytes live in Netlify Blobs');
    expect(migration31).not.toMatch(/\b(?:orders|customers|payments|profiles)\b/i);
    expect(migration31).not.toMatch(/DROP\s+(?:TABLE|INDEX)[^;]*CASCADE/i);
    expect(rollback31).toContain('DROP TABLE IF EXISTS outbound_company_mockups');
    expect(rollback31).not.toContain('CASCADE');
  });
});
