import type { TradeShow, TradeShowIndustry } from './tradeShows';

export interface TradeShowMessageStep {
  label: string;
  value: string;
  note: string;
}

export interface TradeShowPageContent {
  contentReviewedAt: string;
  sourceUrl: string;
  venue?: string;
  organizerVerified: boolean;
  summary: string;
  audience: string;
  showFocus: string;
  bannerAdvice: string;
  bannerGoals: readonly [string, string, string];
  focusAreas: readonly [string, string, string];
  messagePlan: readonly [TradeShowMessageStep, TradeShowMessageStep, TradeShowMessageStep, TradeShowMessageStep];
  installPlan: string;
  sourceNotes: readonly string[];
}

interface IndustryPlaybook {
  audience: string;
  focusAreas: readonly [string, string, string];
  bannerGoal: string;
  visualDirection: string;
  proofPoint: string;
  action: string;
  installPlan: string;
}

interface EventProfile {
  focus: string;
  boothEmphasis: string;
  audience?: string;
}

const CONTENT_REVIEWED_AT = '2026-08-07';

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatEventDateRange(event: Pick<TradeShow, 'startDate' | 'endDate'>): string {
  const start = new Date(`${event.startDate}T12:00:00Z`);
  const end = new Date(`${event.endDate}T12:00:00Z`);
  const startLabel = shortDateFormatter.format(start);
  const endLabel = start.getUTCMonth() === end.getUTCMonth() ? String(end.getUTCDate()) : shortDateFormatter.format(end);
  return `${startLabel}–${endLabel}, ${end.getUTCFullYear()}`;
}

const industryPlaybooks: Record<TradeShowIndustry, IndustryPlaybook> = {
  'Agriculture & Landscape': {
    audience: 'growers, landscape professionals, dealers, suppliers, and equipment buyers',
    focusAreas: ['Product or crop category', 'Dealer or service territory', 'Field-ready benefit'],
    bannerGoal: 'make the product category and its field application understandable from a longer viewing distance',
    visualDirection: 'Use one recognizable product or application image with high-contrast type that remains readable outdoors or around live displays.',
    proofPoint: 'one supportable performance, availability, or service-area fact',
    action: 'Ask for a field demo, dealer conversation, or product sheet',
    installPlan: 'Confirm whether the booth is indoors or outdoors, then verify tent, fence, pipe-and-drape, wind, and tie-down rules before choosing finishing.',
  },
  'Business & Professional': {
    audience: 'association leaders, business owners, operations teams, service buyers, and professional partners',
    focusAreas: ['Business problem solved', 'Who the service is for', 'Clear next step'],
    bannerGoal: 'turn an abstract service into a specific business outcome an attendee can understand in a few seconds',
    visualDirection: 'Favor strong typography, a restrained visual system, and one credible proof point over stock-photo-heavy booth graphics.',
    proofPoint: 'one measurable outcome, specialization, or customer credential',
    action: 'Book a conversation, see a case study, or scan for details',
    installPlan: 'Map the banner around monitors, meeting tables, and demo areas so the core message stays visible when the booth is occupied.',
  },
  'Construction & Infrastructure': {
    audience: 'contractors, engineers, public works teams, utilities, developers, and infrastructure decision-makers',
    focusAreas: ['Application or project type', 'Operational benefit', 'Specification or service coverage'],
    bannerGoal: 'name the infrastructure application before introducing technical detail',
    visualDirection: 'Use real project context, bold labels, and simple diagrams only when every label remains readable at the final printed size.',
    proofPoint: 'one verified capacity, compliance, durability, or delivery fact',
    action: 'Discuss a project, review specifications, or request a demonstration',
    installPlan: 'Allow for equipment, product samples, and safety clearances; confirm display height, rigging, and fire-code requirements with show management.',
  },
  'Education & Research': {
    audience: 'researchers, educators, program leaders, institutional buyers, students, and technical partners',
    focusAreas: ['Research or learning area', 'Practical application', 'Collaboration opportunity'],
    bannerGoal: 'translate a complex program, finding, or capability into one accessible idea',
    visualDirection: 'Pair a plain-language headline with one useful visual; move dense citations, schedules, and methodology to supporting materials.',
    proofPoint: 'one accurate result, capability, accreditation, or partnership fact',
    action: 'Start a research, program, or partnership conversation',
    installPlan: 'Check poster-board, tabletop, and back-wall dimensions separately; do not assume academic poster specifications apply to booth banners.',
  },
  'Energy & Utilities': {
    audience: 'utility leaders, engineers, operators, project developers, regulators, and technology partners',
    focusAreas: ['System or resource area', 'Reliability or efficiency outcome', 'Deployment context'],
    bannerGoal: 'connect a technical solution to the operating decision or system outcome it improves',
    visualDirection: 'Use a clear system view, restrained technical graphics, and short labels instead of a dense feature matrix.',
    proofPoint: 'one supported reliability, efficiency, deployment, or lifecycle fact',
    action: 'Review a use case, technical brief, or project fit',
    installPlan: 'Plan sightlines around equipment and demos, and confirm electrical, height, hanging, and material rules in the exhibitor manual.',
  },
  'Entertainment & Culture': {
    audience: 'fans, creators, publishers, retailers, collectors, media teams, and cultural organizations',
    focusAreas: ['Property or creator identity', 'Featured experience or release', 'Participation cue'],
    bannerGoal: 'create instant recognition without burying the name, offer, or participation cue inside the artwork',
    visualDirection: 'Let the strongest character, artwork, or cultural visual lead while protecting a clean zone for readable event-floor messaging.',
    proofPoint: 'one release, appearance, exclusive, or participation detail',
    action: 'Visit, shop, meet, watch, or scan for the featured experience',
    installPlan: 'Account for crowds, photo lines, merchandise racks, and camera sightlines; keep critical text above likely obstructions.',
  },
  'Fashion & Retail': {
    audience: 'retail buyers, boutique owners, brands, designers, distributors, and merchandising teams',
    focusAreas: ['Brand and product category', 'Collection position', 'Buyer reason to stop'],
    bannerGoal: 'help a buyer place the brand, category, and collection position at a glance',
    visualDirection: 'Use confident art direction and consistent collection imagery, but keep the brand mark and category line unmistakable from the aisle.',
    proofPoint: 'one wholesale, availability, assortment, or product distinction',
    action: 'View the line, write an order, or book a buyer appointment',
    installPlan: 'Map graphics around racks, mannequins, mirrors, and order-writing tables so merchandise does not cover the brand or category line.',
  },
  'Food & Hospitality': {
    audience: 'restaurant and hospitality operators, foodservice buyers, retailers, distributors, and culinary professionals',
    focusAreas: ['Food, beverage, equipment, or service category', 'Buyer benefit', 'Tasting or demo cue'],
    bannerGoal: 'make the product or hospitality category obvious before an attendee reaches the booth',
    visualDirection: 'Use one appetizing or application-focused image and protect ample space for a short, specific buyer-facing headline.',
    proofPoint: 'one supported ingredient, capacity, availability, or operating benefit',
    action: 'Taste, watch a demo, request pricing, or meet the team',
    installPlan: 'Confirm food-service, sampling, heat, electrical, sanitation, and display rules; keep banners clear of prep surfaces and demo traffic.',
  },
  'Healthcare & Wellness': {
    audience: 'clinicians, practice leaders, educators, purchasing teams, administrators, and healthcare partners',
    focusAreas: ['Clinical or operational area', 'Intended user', 'Supported benefit'],
    bannerGoal: 'state the clinical, practice, or wellness problem clearly without overstating performance or health claims',
    visualDirection: 'Use calm hierarchy, readable terminology, and accurate product context; keep qualifications and technical detail close to the relevant claim.',
    proofPoint: 'one properly supported clinical, workflow, education, or service fact',
    action: 'See a demonstration, review evidence, or discuss workflow fit',
    installPlan: 'Confirm booth dimensions and medical-device, demonstration, electrical, and material rules before approving the banner layout.',
  },
  'Manufacturing & Technology': {
    audience: 'engineers, manufacturers, technical buyers, product teams, integrators, and operations leaders',
    focusAreas: ['Technology or process category', 'Use case', 'Technical differentiator'],
    bannerGoal: 'translate a complex product or process into one qualifying use case',
    visualDirection: 'Show the real system, output, or workflow when possible; simplify diagrams and reserve specification depth for close-range materials.',
    proofPoint: 'one supported throughput, compatibility, precision, or implementation fact',
    action: 'See the system, discuss an application, or review specifications',
    installPlan: 'Plan around machines, screens, demo zones, and safety clearances; verify power, rigging, display height, and shipping requirements.',
  },
  'Pets & Veterinary': {
    audience: 'pet retailers, veterinarians, groomers, distributors, practice teams, and animal-care professionals',
    focusAreas: ['Animal and product category', 'Retail or care benefit', 'Buyer or practice cue'],
    bannerGoal: 'make the animal category and product purpose clear before decorative branding competes for attention',
    visualDirection: 'Use one strong animal or product visual, a readable category label, and a color system that complements rather than overwhelms packaging.',
    proofPoint: 'one supported retail, care, ingredient, training, or practice benefit',
    action: 'Try the product, see a demo, discuss wholesale, or meet the team',
    installPlan: 'Keep the main message above product stacks and demo tables, and confirm any live-animal, sampling, sanitation, and display rules.',
  },
  'Public Safety & Government': {
    audience: 'public-safety leaders, government agencies, emergency teams, procurement staff, and operational partners',
    focusAreas: ['Mission or department served', 'Operational problem', 'Procurement-ready next step'],
    bannerGoal: 'identify the mission, user, and operational problem before introducing product features',
    visualDirection: 'Favor direct language, high contrast, real operating context, and one credible differentiator over slogans or decorative effects.',
    proofPoint: 'one supported readiness, compliance, response, service, or deployment fact',
    action: 'Review the capability, procurement path, or operating use case',
    installPlan: 'Confirm equipment footprints, security, demonstration, electrical, hanging, and material rules with the organizer before production.',
  },
  Cannabis: {
    audience: 'licensed operators, retailers, cultivators, processors, brands, service providers, and industry buyers',
    focusAreas: ['Licensed business category', 'Product or service role', 'Compliant buyer benefit'],
    bannerGoal: 'make the business category and buyer value clear while keeping claims and imagery appropriate for the event and jurisdiction',
    visualDirection: 'Use professional brand cues, explicit B2B category language, and restrained product imagery that follows organizer and local advertising rules.',
    proofPoint: 'one supportable compliance, operations, distribution, or product fact',
    action: 'Discuss wholesale, operations, compliance, or partnership fit',
    installPlan: 'Review organizer rules plus local restrictions for products, claims, samples, age-gated areas, imagery, and display materials before printing.',
  },
};

const eventProfiles: Record<string, EventProfile> = {
  'apma-the-national': { focus: 'podiatric medicine, clinical education, practice resources, and products for foot and ankle care', boothEmphasis: 'help podiatric professionals understand the clinical or practice use before they stop for details' },
  'apa-convention': { focus: 'psychology research, education, practice, and professional connection', boothEmphasis: 'make the program, tool, publication, or partnership relevant to a psychology audience without relying on broad wellness language' },
  'adces-annual-meeting': { focus: 'diabetes care and education, clinical practice, technology, and patient support', boothEmphasis: 'show exactly where the offering fits in diabetes education, care delivery, or professional development' },
  'asa-annual-meeting': { focus: 'sociological research, teaching, publishing, policy, and professional exchange', boothEmphasis: 'turn a research, publishing, or institutional offer into a clear reason for attendees to begin a conversation' },
  'evolve-show': { focus: 'fashion brands, emerging collections, and retail discovery', boothEmphasis: 'give buyers an immediate read on the collection category and point of view before they reach the rack' },
  'las-vegas-apparel-august': { focus: 'apparel and accessories buying for boutiques and retailers', boothEmphasis: 'make the brand, season, and wholesale category legible even when racks and shoppers fill the booth' },
  wwin: { focus: 'womenswear, accessories, footwear, and boutique retail buying', boothEmphasis: 'help buyers place the collection quickly and find the line or appointment path that matters to them' },
  'offprice-las-vegas': { focus: 'value-priced apparel, accessories, footwear, and retail inventory', boothEmphasis: 'communicate the merchandise category and buyer value without turning the main banner into a price list' },
  'magic-las-vegas': { focus: 'fashion brands, retail buyers, apparel, footwear, accessories, and sourcing', boothEmphasis: 'separate the brand from a dense visual market while keeping the buyer-facing category unmistakable' },
  'national-homeland-security-conference': { focus: 'homeland security, emergency management, public safety, and interagency readiness', boothEmphasis: 'name the operational mission and agency user before introducing product features' },
  'energy-innovations-rockies-west': { focus: 'regional natural gas, utility strategy, energy markets, and infrastructure planning', boothEmphasis: 'connect the offering to a specific utility, market, infrastructure, or reliability decision' },
  'nursery-landscape-expo': { focus: 'nursery, landscape, irrigation, retail garden, equipment, and green-industry business', boothEmphasis: 'keep product families and service coverage visible around plants, machinery, and live displays' },
  chemedge: { focus: 'chemical distribution operations, safety, compliance, supply chain, and business strategy', boothEmphasis: 'state the operational or compliance problem solved before presenting a technical feature set' },
  'obap-conference': { focus: 'aerospace careers, professional development, recruitment, education, and industry connection', boothEmphasis: 'make the career, partnership, training, or recruiting opportunity specific and welcoming' },
  'wr-expo': { focus: 'waste, recycling, resource recovery, equipment, and environmental services', boothEmphasis: 'show the material stream, facility, or operating use case in plain language' },
  'the-energy-expo': { focus: 'energy technologies, efficiency, resilient systems, and project development', boothEmphasis: 'identify the energy application and project-stage relevance before adding technical detail' },
  'the-water-expo': { focus: 'water, wastewater, infrastructure, treatment, and environmental technology', boothEmphasis: 'make the treatment, infrastructure, or utility application immediately scannable' },
  'fire-rescue-international': { focus: 'fire and emergency-service leadership, apparatus, equipment, training, and operations', boothEmphasis: 'tell fire and EMS leaders what the product does, for whom, and in which operating setting' },
  superzoo: { focus: 'pet retail products, grooming, animal-care brands, and buyer discovery', boothEmphasis: 'balance colorful brand expression with an unmistakable animal category and retail benefit' },
  're-plus-mid-atlantic': { focus: 'solar, storage, clean energy markets, policy, and regional project development', boothEmphasis: 'connect the solution to the project role, market segment, or deployment stage it supports' },
  'current-concepts-mens-health': { focus: "men's health education, clinical practice, treatment updates, and patient care", boothEmphasis: 'use accurate clinical language and make the intended practitioner or care setting explicit' },
  'atlanta-shoe-market': { focus: 'footwear brands, retail buyers, accessories, and wholesale ordering', boothEmphasis: 'keep the brand and footwear segment visible above shelves, samples, and appointment traffic' },
  'asae-annual-meeting': { focus: 'association leadership, member experience, operations, technology, and professional services', boothEmphasis: 'translate the service into a concrete association outcome instead of a general business promise' },
  'wvc-nashville': { focus: 'veterinary medicine, continuing education, practice tools, and animal-health products', boothEmphasis: 'show whether the offering supports clinical care, practice operations, or team education' },
  'nachc-community-health-institute': { focus: 'community health centers, care access, policy, workforce, and health-center operations', boothEmphasis: 'connect the solution to a specific community-health workflow, role, or population need' },
  'ahe-exchange': { focus: 'healthcare environmental services, infection prevention, facilities, leadership, and workforce development', boothEmphasis: 'name the environmental-services task or facility outcome before the product name' },
  'image-2026': { focus: 'geoscience, subsurface insight, energy exploration, data, and technical workflows', boothEmphasis: 'translate the technical capability into one geoscience workflow or decision an attendee can qualify quickly' },
  'nppa-conference': { focus: 'pharmacy purchasing, supply chain, vendor relationships, and healthcare procurement', boothEmphasis: 'make the purchasing category, supply role, and operational value obvious to pharmacy decision-makers' },
  'meals-on-wheels-conference': { focus: 'community nutrition, aging services, nonprofit operations, partnerships, and program delivery', boothEmphasis: 'connect the service or partnership to a clear program, fundraising, volunteer, or delivery need' },
  'maximo-world': { focus: 'enterprise asset management, maintenance, reliability, IBM Maximo, and connected operations', boothEmphasis: 'lead with the asset-management use case and the environment where the solution creates value' },
  'wesa-trade-show': { focus: 'western and English apparel, footwear, accessories, tack, and equestrian retail', boothEmphasis: 'let the collection identity lead while keeping the category and wholesale path readable' },
  'newtopia-now': { focus: 'natural, organic, conscious, and emerging consumer products for retail buyers', boothEmphasis: 'tell buyers what the product is and why it belongs in an assortment before expanding on the brand story' },
  dakotafest: { focus: 'farm equipment, agricultural technology, crop production, services, and field demonstrations', boothEmphasis: 'design for outdoor distance, equipment-scale displays, and fast recognition from moving foot traffic' },
  'ise-expo': { focus: 'communications infrastructure, broadband networks, outside plant, construction, and field operations', boothEmphasis: 'name the network layer or field application before adding specifications' },
  'future-biotech-expo': { focus: 'biotechnology, life science innovation, research tools, commercialization, and partnerships', boothEmphasis: 'make the research or commercialization use case understandable without flattening the science into vague claims' },
  'outdoor-retailer': { focus: 'outdoor products, gear, apparel, brands, retail buying, and industry connection', boothEmphasis: 'make the activity category and product distinction visible around gear-heavy displays' },
  'the-landscape-show': { focus: 'nursery products, landscape services, equipment, retail horticulture, and green-industry buying', boothEmphasis: 'separate company recognition from product-family signs while protecting sightlines around living material' },
  'ivt-expo': { focus: 'industrial and off-highway vehicle engineering, components, controls, and vehicle technology', boothEmphasis: 'identify the vehicle system and engineering application before presenting technical specifications' },
  'anime-nyc': { focus: 'anime, manga, creators, publishers, screenings, merchandise, and fan experiences', boothEmphasis: 'use recognizable creative assets while keeping the exhibitor name and participation cue clear in crowded aisles' },
  'southwest-dental-conference': { focus: 'dental continuing education, clinical products, practice technology, and professional services', boothEmphasis: 'identify the dental workflow or practice problem and keep every clinical or performance claim supportable' },
  'coffee-fest-los-angeles': { focus: 'specialty coffee, cafe operations, roasting, equipment, ingredients, and hospitality', boothEmphasis: 'make the product category or cafe use clear before the tasting or demo begins' },
  'demo-days-festival': { focus: 'emerging technology demonstrations, product launches, builders, and hands-on discovery', boothEmphasis: 'use the banner to frame the demo problem and outcome instead of repeating what the screen already shows' },
  'california-restaurant-show': { focus: 'restaurant, foodservice, hospitality, equipment, technology, and operator solutions', boothEmphasis: 'make the food, equipment, technology, or service category obvious before attendees reach the booth' },
  'acs-fall': { focus: 'chemical science research, education, publishing, instrumentation, and professional exchange', boothEmphasis: 'translate the scientific offering into a clear research, laboratory, education, or partnership use case' },
  'nigp-forum': { focus: 'public procurement, government purchasing, supplier relationships, technology, and professional development', boothEmphasis: 'connect the offering to a procurement task, agency outcome, or compliant buying path' },
  'ed-expo': { focus: 'education products, learning environments, school resources, and institutional buying', boothEmphasis: 'show the learning setting, age group, or institutional use before expanding on features' },
  'international-congress-esthetics-spa': { focus: 'esthetics, skincare, spa services, professional products, and practitioner education', boothEmphasis: 'balance strong beauty visuals with a clear professional category and accurate product claims' },
  iltacon: { focus: 'legal technology, law-firm operations, information management, security, and professional services', boothEmphasis: 'name the legal workflow, team, or risk the solution addresses instead of leading with generic innovation language' },
  'spie-optics-photonics': { focus: 'optics, photonics, imaging, scientific research, components, and technical applications', boothEmphasis: 'make the optical or photonics application legible before adding performance data' },
  'techcon-365': { focus: 'Microsoft cloud, data, AI, workplace technology, power platform, and technical learning', boothEmphasis: 'state the platform, workload, or implementation outcome so technical attendees can self-qualify' },
  'connect-summer-marketplace': { focus: 'meetings, events, destinations, venues, hospitality, and hosted-buyer appointments', boothEmphasis: 'turn a destination or service story into a specific reason for planners to book a conversation' },
  'iwf-atlanta': { focus: 'woodworking machinery, manufacturing technology, components, materials, and production systems', boothEmphasis: 'keep the brand and application visible when machinery, demonstrations, and safety zones dominate the booth' },
  'rocky-mountain-apparel-show': { focus: 'apparel, gift, resort, souvenir, and lifestyle products for retail buyers', boothEmphasis: 'help buyers identify the category, collection position, and wholesale conversation at a glance' },
  'spe-artificial-lift-conference': { focus: 'artificial lift systems, production optimization, oil and gas operations, and technical exchange', boothEmphasis: 'lead with the production challenge or lift application before technical detail' },
  'broadband-communities-summit': { focus: 'broadband deployment, community connectivity, multifamily networks, infrastructure, and digital access', boothEmphasis: 'identify the network environment, deployment role, or community outcome in the headline' },
  'asd-market-week': { focus: 'consumer merchandise, general retail, value buying, gifts, accessories, and wholesale sourcing', boothEmphasis: 'make the merchandise category and buyer value easy to scan across a broad, high-density market floor' },
  stormcon: { focus: 'stormwater management, erosion control, green infrastructure, compliance, and municipal systems', boothEmphasis: 'state the stormwater application or site problem before showing product details' },
  'meddevice-boston': { focus: 'medical device design, manufacturing, components, testing, and product development', boothEmphasis: 'connect the capability to a device-development stage, engineering need, or manufacturing use case' },
  'northeast-materials-show': { focus: 'footwear and apparel materials, components, sourcing, and supplier discovery', boothEmphasis: 'identify the material or component category and its design or production advantage without overcrowding the sample display' },
  'farwest-show': { focus: 'nursery, horticulture, retail garden, equipment, and green-industry business', boothEmphasis: 'use contrast that stays readable around live plants and separate the company brand from product-family labels' },
  'ngaus-general-conference': { focus: 'National Guard leadership, readiness, equipment, policy, partnerships, and professional connection', boothEmphasis: 'make the mission, unit need, or operational capability explicit before adding feature detail' },
  'fetch-kansas-city': { focus: 'veterinary continuing education, clinical practice, team development, and animal-health solutions', boothEmphasis: 'show the clinical, practice, or education role clearly to veterinary teams' },
  'american-legion-national-convention': { focus: 'veterans, service programs, organizational business, community initiatives, and partner resources', boothEmphasis: 'connect the offering to a specific veteran, post, family, or community need with respectful direct language' },
  'lucky-leaf-expo-richmond': { focus: 'cannabis business operations, cultivation, processing, retail, compliance, and industry services', boothEmphasis: 'state the licensed-business function and buyer value while following event and local rules for claims and imagery' },
  'cannacon-st-louis': { focus: 'cannabis cultivation, manufacturing, retail, technology, services, and B2B partnerships', boothEmphasis: 'help operators identify the business category, stage, and partnership fit without consumer-style ambiguity' },
  'iecsc-florida': { focus: 'esthetics, cosmetics, spa, professional skincare, equipment, and practitioner education', boothEmphasis: 'make the professional product or service category clear and keep cosmetic or performance claims accurate' },
  'pwx-2026': { focus: 'public works, infrastructure, fleet, facilities, utilities, streets, and municipal operations', boothEmphasis: 'state the department, infrastructure problem, or municipal application in the first line' },
  'awwa-water-infrastructure-conference': { focus: 'water infrastructure, utility engineering, asset management, resilience, and capital planning', boothEmphasis: 'connect the solution to a utility asset, project phase, or infrastructure decision' },
  'pva-healthcare-summit': { focus: 'veteran and disability healthcare, clinical practice, rehabilitation, products, and professional education', boothEmphasis: 'identify the care setting and intended user with precise, respectful, and supportable language' },
  'vpppa-safety-symposium': { focus: 'workplace safety, health, compliance, leadership, training, and operational improvement', boothEmphasis: 'name the hazard, workforce, or safety-management outcome before introducing the solution' },
  'hr-florida-conference': { focus: 'human resources, workforce strategy, talent, compliance, technology, and leadership', boothEmphasis: 'translate the offering into a specific HR workflow or workforce outcome rather than a broad people promise' },
  'trendz-apparel-show': { focus: 'womenswear, accessories, resort, lifestyle, and boutique retail buying', boothEmphasis: 'make the collection category and buyer fit visible above racks and appointment activity' },
  'premiere-san-antonio': { focus: 'professional beauty, hair, barbering, nails, skincare, education, and salon products', boothEmphasis: 'combine high-energy beauty visuals with a clear professional category, demo cue, and supportable claim' },
  'north-east-toy-show': { focus: 'toys, games, gifts, specialty retail products, and wholesale buying', boothEmphasis: 'make the age, play, or merchandise category obvious without letting colorful product art bury the brand' },
  'idn-summit-reverse-expo': { focus: 'health-system supply chain, integrated delivery networks, suppliers, contracting, and executive connections', boothEmphasis: 'state the health-system category and supply-chain value in procurement-ready language' },
};

export function hasTradeShowProfile(slug: string): boolean {
  return Boolean(eventProfiles[slug]);
}

export function getTradeShowPageContent(event: TradeShow): TradeShowPageContent {
  const profile = eventProfiles[event.slug];
  if (!profile) throw new Error(`Missing trade-show content profile for ${event.slug}`);

  const playbook = industryPlaybooks[event.industry];
  const audience = profile.audience || playbook.audience;
  const organizerVerified = Boolean(event.editorial);
  const dateAndPlace = `${event.name} is listed for ${formatEventDateRange(event)} in ${event.city}, ${event.state}`;
  const summary = event.editorial?.summary
    || `${event.name} is centered on ${profile.focus}. For exhibitors, the practical challenge is to ${profile.boothEmphasis}. This independent planner connects that show context to banner messaging, sizing, installation, and delivery decisions.`;
  const bannerAdvice = event.editorial?.bannerAdvice
    || `For ${event.shortName}, ${playbook.bannerGoal}. ${profile.boothEmphasis.charAt(0).toUpperCase()}${profile.boothEmphasis.slice(1)}. ${playbook.visualDirection}`;

  return {
    contentReviewedAt: CONTENT_REVIEWED_AT,
    sourceUrl: event.editorial?.sourceUrl || event.officialUrl,
    venue: event.editorial?.venue,
    organizerVerified,
    summary,
    audience,
    showFocus: profile.focus,
    bannerAdvice,
    bannerGoals: [
      `Make ${profile.focus} understandable from the aisle.`,
      `Give ${audience} a specific reason to stop.`,
      playbook.visualDirection,
    ],
    focusAreas: playbook.focusAreas,
    messagePlan: [
      { label: 'Brand', value: 'Company or product-line name', note: 'Keep it recognizable and unobstructed.' },
      { label: 'Category', value: profile.focus, note: 'Use the plain-language version a qualified attendee would scan for.' },
      { label: 'Proof', value: playbook.proofPoint, note: 'Choose a fact you can substantiate; one is enough for the main banner.' },
      { label: 'Action', value: playbook.action, note: 'Tell the right attendee what to do next inside the booth.' },
    ],
    installPlan: playbook.installPlan,
    sourceNotes: event.editorial?.verifiedFacts || [
      `${dateAndPlace}; confirm the current schedule and venue on the official event website.`,
      'Registration, exhibitor services, move-in, shipping, display, and fire-code rules are controlled by the event organizer and venue.',
    ],
  };
}

export function getTradeShowFaqs(event: TradeShow): { question: string; answer: string }[] {
  const content = getTradeShowPageContent(event);
  return [
    {
      question: `When and where is ${event.shortName} 2026?`,
      answer: `${event.name} is listed for ${formatEventDateRange(event)} in ${event.city}, ${event.state}. Event details can change, so confirm the current venue, schedule, and registration information on the official event website.`,
    },
    {
      question: `What should an exhibitor banner for ${event.shortName} say?`,
      answer: `Start with the company or product-line name, describe the category in plain language, add one supportable proof point, and give attendees one next action. For this show, the central focus is ${content.showFocus}.`,
    },
    {
      question: `What banner size works for a booth at ${event.shortName}?`,
      answer: 'Common starting points include a 6 × 2 ft table-front banner, an 8 × 3 ft back-wall banner, or an 8 × 8 ft backdrop. The correct size depends on the booth package, visible mounting area, display-height limits, and organizer rules.',
    },
    {
      question: 'Is Banners On The Fly affiliated with this trade show?',
      answer: `No. Banners On The Fly is an independent banner-printing company and exhibitor-planning resource. It is not affiliated with, endorsed by, or an official supplier of ${event.name} or its organizer.`,
    },
  ];
}
