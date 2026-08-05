export const TRADE_SHOW_INDUSTRIES = [
  'Agriculture & Landscape',
  'Business & Professional',
  'Construction & Infrastructure',
  'Education & Research',
  'Energy & Utilities',
  'Entertainment & Culture',
  'Fashion & Retail',
  'Food & Hospitality',
  'Healthcare & Wellness',
  'Manufacturing & Technology',
  'Pets & Veterinary',
  'Public Safety & Government',
  'Cannabis',
] as const;

export type TradeShowIndustry = (typeof TRADE_SHOW_INDUSTRIES)[number];

export interface TradeShowEditorial {
  reviewedAt: string;
  sourceUrl: string;
  venue: string;
  summary: string;
  bannerAdvice: string;
  verifiedFacts: string[];
}

export interface TradeShow {
  slug: string;
  name: string;
  shortName: string;
  startDate: string;
  endDate: string;
  city: string;
  state: string;
  industry: TradeShowIndustry;
  officialUrl: string;
  editorial?: TradeShowEditorial;
}

type TradeShowRow = readonly [
  slug: string,
  name: string,
  shortName: string,
  startDate: string,
  endDate: string,
  city: string,
  state: string,
  industry: TradeShowIndustry,
  officialUrl: string,
];

const rows: TradeShowRow[] = [
  ['apma-the-national', 'American Podiatric Medical Association — The National', 'APMA The National', '2026-08-06', '2026-08-09', 'Nashville', 'TN', 'Healthcare & Wellness', 'https://www.apma.org/events/the-national/'],
  ['apa-convention', 'American Psychological Association Convention', 'APA Convention', '2026-08-06', '2026-08-08', 'Washington', 'DC', 'Healthcare & Wellness', 'https://convention.apa.org/'],
  ['adces-annual-meeting', 'ADCES Annual Meeting', 'ADCES Annual Meeting', '2026-08-07', '2026-08-10', 'Columbus', 'OH', 'Healthcare & Wellness', 'https://www.adcesmeeting.org/'],
  ['asa-annual-meeting', 'American Sociological Association Annual Meeting', 'ASA Annual Meeting', '2026-08-07', '2026-08-11', 'New York', 'NY', 'Education & Research', 'https://www.asanet.org/annual-meeting/'],
  ['evolve-show', 'Evolve Show', 'Evolve Show', '2026-08-09', '2026-08-11', 'Las Vegas', 'NV', 'Fashion & Retail', 'https://evolveshows.com/'],
  ['las-vegas-apparel-august', 'Las Vegas Apparel — August', 'Las Vegas Apparel', '2026-08-09', '2026-08-12', 'Las Vegas', 'NV', 'Fashion & Retail', 'https://www.lasvegas-apparel.com/'],
  ['wwin', 'Womenswear in Nevada', 'WWIN', '2026-08-09', '2026-08-12', 'Las Vegas', 'NV', 'Fashion & Retail', 'https://www.wwinshow.com/'],
  ['offprice-las-vegas', 'OFFPRICE Las Vegas', 'OFFPRICE', '2026-08-10', '2026-08-12', 'Las Vegas', 'NV', 'Fashion & Retail', 'https://www.offpriceshow.com/'],
  ['magic-las-vegas', 'MAGIC Las Vegas', 'MAGIC Las Vegas', '2026-08-10', '2026-08-12', 'Las Vegas', 'NV', 'Fashion & Retail', 'https://www.magicfashionevents.com/en/events/magic-las-vegas.html'],
  ['national-homeland-security-conference', 'National Homeland Security Conference', 'Homeland Security Conference', '2026-08-10', '2026-08-13', 'Louisville', 'KY', 'Public Safety & Government', 'https://www.nationalhomelandsecurity.org/'],
  ['energy-innovations-rockies-west', 'Energy Innovations: Rockies & West Forum', 'Energy Innovations Forum', '2026-08-10', '2026-08-12', 'San Diego', 'CA', 'Energy & Utilities', 'https://www.ldcgasforums.com/'],
  ['nursery-landscape-expo', 'Nursery & Landscape Expo', 'Nursery & Landscape Expo', '2026-08-11', '2026-08-13', 'San Antonio', 'TX', 'Agriculture & Landscape', 'https://www.nurserylandscapeexpo.org/'],
  ['chemedge', 'ChemEdge', 'ChemEdge', '2026-08-12', '2026-08-14', 'Atlanta', 'GA', 'Manufacturing & Technology', 'https://www.acd-chem.com/chemedge/'],
  ['obap-conference', 'Organization of Black Aerospace Professionals Conference', 'OBAP Conference', '2026-08-12', '2026-08-14', 'Chicago', 'IL', 'Business & Professional', 'https://obap.org/'],
  ['wr-expo', 'Waste & Recycling Expo', 'WR Expo', '2026-08-12', '2026-08-13', 'Fort Lauderdale', 'FL', 'Energy & Utilities', 'https://www.wrexpo.com/'],
  ['the-energy-expo', 'The Energy Expo', 'The Energy Expo', '2026-08-12', '2026-08-13', 'Fort Lauderdale', 'FL', 'Energy & Utilities', 'https://www.theenergyexpo.com/'],
  ['the-water-expo', 'The Water Expo', 'The Water Expo', '2026-08-12', '2026-08-13', 'Fort Lauderdale', 'FL', 'Energy & Utilities', 'https://www.thewaterexpo.com/'],
  ['fire-rescue-international', 'Fire-Rescue International', 'Fire-Rescue International', '2026-08-12', '2026-08-14', 'Kansas City', 'MO', 'Public Safety & Government', 'https://www.iafc.org/events/fri'],
  ['superzoo', 'SUPERZOO', 'SUPERZOO', '2026-08-12', '2026-08-14', 'Las Vegas', 'NV', 'Pets & Veterinary', 'https://www.superzoo.org/'],
  ['re-plus-mid-atlantic', 'RE+ Mid-Atlantic', 'RE+ Mid-Atlantic', '2026-08-12', '2026-08-13', 'Philadelphia', 'PA', 'Energy & Utilities', 'https://re-plus.events/midatlantic/'],
  ['current-concepts-mens-health', "Current Concepts in Men's Health", "Men's Health Course", '2026-08-13', '2026-08-16', 'Saratoga Springs', 'NY', 'Healthcare & Wellness', 'https://menshealthcourse.com/'],
  ['atlanta-shoe-market', 'The Atlanta Shoe Market', 'Atlanta Shoe Market', '2026-08-15', '2026-08-17', 'Atlanta', 'GA', 'Fashion & Retail', 'https://www.atlantashoemarket.com/'],
  ['asae-annual-meeting', 'ASAE Annual Meeting & Exposition', 'ASAE Annual Meeting', '2026-08-15', '2026-08-18', 'Indianapolis', 'IN', 'Business & Professional', 'https://annual2026.asaecenter.org/'],
  ['wvc-nashville', 'WVC Nashville Conference', 'WVC Nashville', '2026-08-15', '2026-08-18', 'Nashville', 'TN', 'Pets & Veterinary', 'https://www.viticusgroup.org/wvc-conference-nashville'],
  ['nachc-community-health-institute', 'NACHC Community Health Institute & Expo', 'NACHC CHI & Expo', '2026-08-16', '2026-08-18', 'Las Vegas', 'NV', 'Healthcare & Wellness', 'https://www.nachc.org/conferences/chi/'],
  ['ahe-exchange', 'AHE Exchange Conference', 'AHE Exchange', '2026-08-16', '2026-08-19', 'New Orleans', 'LA', 'Healthcare & Wellness', 'https://www.ahe.org/ahe-exchange-conference'],
  ['image-2026', 'IMAGE 2026', 'IMAGE 2026', '2026-08-17', '2026-08-20', 'Houston', 'TX', 'Energy & Utilities', 'https://www.imageevent.org/'],
  ['nppa-conference', 'National Pharmacy Purchasing Association Conference', 'NPPA Conference', '2026-08-17', '2026-08-20', 'Las Vegas', 'NV', 'Healthcare & Wellness', 'https://www.pharmacypurchasing.com/'],
  ['meals-on-wheels-conference', 'Meals on Wheels Annual Conference & Expo', 'Meals on Wheels Conference', '2026-08-17', '2026-08-20', 'Las Vegas', 'NV', 'Business & Professional', 'https://mowa2026.eventscribe.net/'],
  ['maximo-world', 'MaximoWorld', 'MaximoWorld', '2026-08-17', '2026-08-20', 'Nashville', 'TN', 'Manufacturing & Technology', 'https://maximoworld.com/'],
  ['wesa-trade-show', 'WESA August Trade Show', 'WESA Trade Show', '2026-08-18', '2026-08-21', 'Dallas', 'TX', 'Fashion & Retail', 'https://wesatradeshow.com/'],
  ['newtopia-now', 'Newtopia Now', 'Newtopia Now', '2026-08-18', '2026-08-20', 'Denver', 'CO', 'Food & Hospitality', 'https://www.newtopianow.com/'],
  ['dakotafest', 'Dakotafest', 'Dakotafest', '2026-08-18', '2026-08-20', 'Mitchell', 'SD', 'Agriculture & Landscape', 'https://www.dakotafest.com/'],
  ['ise-expo', 'ISE Expo', 'ISE Expo', '2026-08-18', '2026-08-20', 'Nashville', 'TN', 'Construction & Infrastructure', 'https://www.iseexpo.com/'],
  ['future-biotech-expo', 'Future BioTech Expo', 'Future BioTech Expo', '2026-08-19', '2026-08-20', 'Houston', 'TX', 'Healthcare & Wellness', 'https://futurebiotechexpo.com/'],
  ['outdoor-retailer', 'Outdoor Retailer', 'Outdoor Retailer', '2026-08-19', '2026-08-21', 'Minneapolis', 'MN', 'Fashion & Retail', 'https://outdoorretailer.com/'],
  ['the-landscape-show', 'The Landscape Show', 'The Landscape Show', '2026-08-19', '2026-08-21', 'Orlando', 'FL', 'Agriculture & Landscape', 'https://www.thelandscapeshow.org/'],
  ['ivt-expo', 'Industrial & Off-Highway Vehicle Technology Expo', 'iVT Expo', '2026-08-19', '2026-08-20', 'Rosemont', 'IL', 'Manufacturing & Technology', 'https://www.ivtexpo.com/'],
  ['anime-nyc', 'Anime NYC', 'Anime NYC', '2026-08-20', '2026-08-23', 'New York', 'NY', 'Entertainment & Culture', 'https://animenyc.com/'],
  ['southwest-dental-conference', 'Southwest Dental Conference', 'Southwest Dental Conference', '2026-08-21', '2026-08-22', 'Dallas', 'TX', 'Healthcare & Wellness', 'https://swdentalconf.org/'],
  ['coffee-fest-los-angeles', 'Coffee Fest Los Angeles', 'Coffee Fest', '2026-08-21', '2026-08-22', 'Los Angeles', 'CA', 'Food & Hospitality', 'https://www.coffeefest.com/'],
  ['demo-days-festival', 'Demo Days Festival', 'Demo Days Festival', '2026-08-22', '2026-08-23', 'San Francisco', 'CA', 'Manufacturing & Technology', 'https://demodaysfestival.com/'],
  ['california-restaurant-show', 'California Restaurant Show', 'California Restaurant Show', '2026-08-23', '2026-08-25', 'Anaheim', 'CA', 'Food & Hospitality', 'https://www.californiarestaurantshow.com/'],
  ['acs-fall', 'American Chemical Society Fall Meeting', 'ACS Fall', '2026-08-23', '2026-08-27', 'Chicago', 'IL', 'Education & Research', 'https://www.acs.org/events/fall.html'],
  ['nigp-forum', 'NIGP Forum', 'NIGP Forum', '2026-08-23', '2026-08-26', 'Columbus', 'OH', 'Public Safety & Government', 'https://www.nigp.org/events/annual-forum'],
  ['ed-expo', 'The ED Expo', 'The ED Expo', '2026-08-23', '2026-08-26', 'Las Vegas', 'NV', 'Education & Research', 'https://www.theedexpo.com/'],
  ['international-congress-esthetics-spa', 'International Congress of Esthetics & Spa', 'ICES Long Beach', '2026-08-23', '2026-08-24', 'Long Beach', 'CA', 'Healthcare & Wellness', 'https://skincareshows.com/'],
  ['iltacon', 'ILTACON', 'ILTACON', '2026-08-23', '2026-08-27', 'Nashville', 'TN', 'Business & Professional', 'https://www.iltacon.org/'],
  ['spie-optics-photonics', 'SPIE Optics + Photonics', 'SPIE Optics + Photonics', '2026-08-23', '2026-08-27', 'San Diego', 'CA', 'Manufacturing & Technology', 'https://spie.org/conferences-and-exhibitions/optics-and-photonics'],
  ['techcon-365', 'TechCon 365, DataCon & PwrCon', 'TechCon 365', '2026-08-24', '2026-08-28', 'Seattle', 'WA', 'Manufacturing & Technology', 'https://techcon365.com/'],
  ['connect-summer-marketplace', 'Connect Summer Marketplace', 'Connect Marketplace', '2026-08-24', '2026-08-26', 'Tampa', 'FL', 'Business & Professional', 'https://informaconnect.com/connect-marketplace/'],
  ['iwf-atlanta', 'International Woodworking Fair', 'IWF Atlanta', '2026-08-25', '2026-08-28', 'Atlanta', 'GA', 'Manufacturing & Technology', 'https://www.iwfatlanta.com/'],
  ['rocky-mountain-apparel-show', 'Rocky Mountain Apparel, Gift & Resort Show', 'Rocky Mountain Show', '2026-08-25', '2026-08-27', 'Denver', 'CO', 'Fashion & Retail', 'https://www.rockymountainshow.com/'],
  ['spe-artificial-lift-conference', 'SPE Artificial Lift Conference and Exhibition', 'SPE Artificial Lift', '2026-08-25', '2026-08-27', 'Houston', 'TX', 'Energy & Utilities', 'https://www.spe-events.org/artificial-lift/'],
  ['broadband-communities-summit', 'Broadband Communities Summit', 'Broadband Communities Summit', '2026-08-25', '2026-08-27', 'Houston', 'TX', 'Construction & Infrastructure', 'https://www.terrapinn.com/conference/broadband-communities/'],
  ['asd-market-week', 'ASD Market Week', 'ASD Market Week', '2026-08-25', '2026-08-27', 'Las Vegas', 'NV', 'Fashion & Retail', 'https://www.asdonline.com/'],
  ['stormcon', 'StormCon', 'StormCon', '2026-08-25', '2026-08-27', 'Minneapolis', 'MN', 'Construction & Infrastructure', 'https://www.stormcon.com/'],
  ['meddevice-boston', 'MEDevice Boston', 'MEDevice Boston', '2026-08-26', '2026-08-27', 'Boston', 'MA', 'Manufacturing & Technology', 'https://www.medeviceboston.com/'],
  ['northeast-materials-show', 'The Northeast Materials Show', 'Northeast Materials Show', '2026-08-26', '2026-08-27', 'Danvers', 'MA', 'Manufacturing & Technology', 'https://americanevents.com/'],
  ['farwest-show', 'Farwest Show', 'Farwest Show', '2026-08-26', '2026-08-28', 'Portland', 'OR', 'Agriculture & Landscape', 'https://farwestshow.com/'],
  ['ngaus-general-conference', 'NGAUS General Conference & Exhibition', 'NGAUS Conference', '2026-08-28', '2026-08-31', 'Indianapolis', 'IN', 'Public Safety & Government', 'https://www.ngaus.org/events/general-conference'],
  ['fetch-kansas-city', 'Fetch Kansas City', 'Fetch Kansas City', '2026-08-28', '2026-08-30', 'Kansas City', 'MO', 'Pets & Veterinary', 'https://www.dvm360events.com/'],
  ['american-legion-national-convention', 'American Legion National Convention', 'American Legion Convention', '2026-08-28', '2026-09-03', 'Louisville', 'KY', 'Public Safety & Government', 'https://www.legion.org/convention'],
  ['lucky-leaf-expo-richmond', 'Lucky Leaf Expo Richmond', 'Lucky Leaf Expo', '2026-08-28', '2026-08-29', 'Richmond', 'VA', 'Cannabis', 'https://luckyleafexpo.com/'],
  ['cannacon-st-louis', 'CannaCon St. Louis', 'CannaCon', '2026-08-28', '2026-08-29', 'St. Louis', 'MO', 'Cannabis', 'https://cannacon.org/'],
  ['iecsc-florida', 'International Esthetics, Cosmetics & Spa Conference Florida', 'IECSC Florida', '2026-08-30', '2026-08-31', 'Fort Lauderdale', 'FL', 'Healthcare & Wellness', 'https://www.iecscflorida.com/'],
  ['pwx-2026', 'PWX 2026', 'PWX 2026', '2026-08-30', '2026-09-02', 'Houston', 'TX', 'Construction & Infrastructure', 'https://www.apwa.org/events/pwx-conference/'],
  ['awwa-water-infrastructure-conference', 'AWWA Water Infrastructure Conference', 'AWWA Water Infrastructure', '2026-08-30', '2026-09-02', 'Indianapolis', 'IN', 'Energy & Utilities', 'https://www.awwa.org/events-education/water-infrastructure-conference/'],
  ['pva-healthcare-summit', 'PVA Healthcare Summit + Expo', 'PVA Healthcare Summit', '2026-08-30', '2026-09-02', 'Las Vegas', 'NV', 'Healthcare & Wellness', 'https://www.summitpva.org/'],
  ['vpppa-safety-symposium', 'VPPPA Safety+ Symposium', 'Safety+ Symposium', '2026-08-30', '2026-09-02', 'Nashville', 'TN', 'Public Safety & Government', 'https://safety.vpppa.org/'],
  ['hr-florida-conference', 'HR Florida Conference & Expo', 'HR Florida Conference', '2026-08-30', '2026-09-02', 'Orlando', 'FL', 'Business & Professional', 'https://hrflorida.org/page/State_Conference'],
  ['trendz-apparel-show', 'TRENDZ Apparel Trade Show', 'TRENDZ Apparel', '2026-08-30', '2026-09-01', 'Palm Beach', 'FL', 'Fashion & Retail', 'https://www.trendzshow.com/'],
  ['premiere-san-antonio', 'Premiere San Antonio', 'Premiere San Antonio', '2026-08-30', '2026-08-31', 'San Antonio', 'TX', 'Healthcare & Wellness', 'https://www.premieresanantonioshow.com/'],
  ['north-east-toy-show', 'North East Toy Show', 'North East Toy Show', '2026-08-30', '2026-09-01', 'Springfield', 'MA', 'Fashion & Retail', 'https://netoyshow.com/'],
  ['idn-summit-reverse-expo', 'IDN Summit & Reverse Expo', 'IDN Summit', '2026-08-31', '2026-09-02', 'Phoenix', 'AZ', 'Healthcare & Wellness', 'https://www.idnsummit.com/'],
];

const REVIEWED_AT = '2026-08-05';

const editorialBySlug: Record<string, TradeShowEditorial> = {
  'magic-las-vegas': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.magicfashionevents.com/en/events/magic-las-vegas.html',
    venue: 'Las Vegas Convention Center',
    summary: 'MAGIC Las Vegas brings fashion brands and retail buyers together across apparel, footwear, accessories, and sourcing. A booth banner should work as a fast brand-and-category signal in a visually crowded buying environment.',
    bannerAdvice: 'Lead with the brand name, one product category, and a short buyer-facing promise. Keep secondary copy off the main aisle-facing banner and reserve it for tabletop or interior booth signs.',
    verifiedFacts: ['The official 2026 schedule lists August 10–12.', 'The organizer identifies the Las Vegas Convention Center as the venue.'],
  },
  'national-homeland-security-conference': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.nationalhomelandsecurity.org/',
    venue: 'Kentucky International Convention Center',
    summary: 'The National Homeland Security Conference serves public-safety, emergency-management, fire, law-enforcement, and related government professionals. Exhibitor graphics benefit from plain language, high contrast, and a clear description of the operational problem being solved.',
    bannerAdvice: 'Make the solution category readable before the product name. Use one proof point only if it can be supported, and avoid dense feature lists that cannot be read from the aisle.',
    verifiedFacts: ['The official site lists August 10–13 in Louisville.', 'The organizer says the conference brings together more than 1,000 attendees.'],
  },
  'nursery-landscape-expo': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.nurserylandscapeexpo.org/',
    venue: 'Henry B. González Convention Center',
    summary: 'The Nursery & Landscape Expo connects nursery, landscape, irrigation, retail, and allied green-industry professionals. Exhibitors can use large-format graphics to make plant categories, equipment applications, or service territories obvious from the aisle.',
    bannerAdvice: 'Use strong product photography only when it remains identifiable at distance. Pair it with a short category label and booth number; save species lists, specifications, and QR details for smaller signs.',
    verifiedFacts: ['The official event dates are August 11–13.', 'The event is held at the Henry B. González Convention Center in San Antonio.'],
  },
  'fire-rescue-international': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.iafc.org/events/fri',
    venue: 'Kansas City Convention Center',
    summary: 'Fire-Rescue International is the International Association of Fire Chiefs’ annual conference and expo. Booth messaging should tell fire and EMS leaders what the product does, for whom, and in which operational setting without relying on clever but vague language.',
    bannerAdvice: 'Prioritize legibility and real operating context. A simple application headline, product visual, and one credible differentiator will usually outperform a wall of specifications.',
    verifiedFacts: ['The official conference schedule lists August 12–14 in Kansas City.', 'The IAFC describes the event as serving fire and emergency-service leaders.'],
  },
  superzoo: {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.superzoo.org/',
    venue: 'Mandalay Bay Convention Center',
    summary: 'SUPERZOO is a pet retail marketplace for brands, buyers, groomers, and other industry professionals. Colorful booth graphics can attract attention, but the main banner still needs to communicate the animal category and product benefit in a glance.',
    bannerAdvice: 'Show the pet category clearly and keep packaging, mascot, and headline from competing with one another. If you serve retailers, make the wholesale or buyer benefit visible near eye level.',
    verifiedFacts: ['The official site lists August 12–14 at Mandalay Bay Convention Center.', 'The organizer describes a 350,000-square-foot show floor and more than 10,000 buyers.'],
  },
  'image-2026': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.imageevent.org/',
    venue: 'George R. Brown Convention Center',
    summary: 'IMAGE brings geoscience and energy professionals together for technical programming and an exhibition. Exhibitor banners should translate complex tools, data, or services into one clear use case that a technical attendee can qualify quickly.',
    bannerAdvice: 'Name the workflow or decision your offering improves. Use diagrams only if their labels remain readable at the finished size, and move detailed technical comparisons to handouts or a QR-linked page.',
    verifiedFacts: ['The official site lists August 17–20 at the George R. Brown Convention Center.', 'The organizer projects 8,000 attendees and participants from 83 countries.'],
  },
  'wesa-trade-show': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://wesatradeshow.com/',
    venue: 'Dallas Market Center',
    summary: 'The WESA Trade Show is a buying event for western and English apparel, footwear, accessories, and equestrian products. Booth banners should help retailers immediately place the brand within a product category and price or style position.',
    bannerAdvice: 'Let the collection’s visual identity carry the design, but include a readable brand mark and category line. Use consistent colors across the main banner, rack signage, and order-writing area.',
    verifiedFacts: ['The official August market runs August 18–21 in Dallas.', 'The organizer promotes more than 550 exhibitors and product lines.'],
  },
  'newtopia-now': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.newtopianow.com/',
    venue: 'Colorado Convention Center',
    summary: 'Newtopia Now is a natural and conscious products marketplace built around discovery and buyer connections. An exhibitor banner can carry brand story, but it should first tell buyers what the product is and why it belongs in their assortment.',
    bannerAdvice: 'Use one short positioning line with the product category in plain language. Claims such as organic, sustainable, or clinically supported should appear only when substantiated and appropriate for the product.',
    verifiedFacts: ['The official event runs August 18–20 in Denver.', 'The show floor is at the Colorado Convention Center.'],
  },
  dakotafest: {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.dakotafest.com/',
    venue: 'Dakotafest grounds',
    summary: 'Dakotafest is an outdoor agriculture show with equipment, technology, services, and field-focused demonstrations. Outdoor exhibitor banners need high contrast, short copy, and finishing selected for the actual mounting plan and weather exposure.',
    bannerAdvice: 'Design for longer viewing distances than an indoor booth. Confirm fence, tent, or equipment attachment points before ordering and ask the organizer what materials and tie-down methods are permitted.',
    verifiedFacts: ['The official show dates are August 18–20 in Mitchell.', 'The organizer lists more than 400 exhibitors.'],
  },
  'the-landscape-show': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.thelandscapeshow.org/',
    venue: 'Orange County Convention Center',
    summary: 'The Landscape Show brings together nursery, landscape, equipment, and related green-industry exhibitors and buyers. A modular banner set can separate the company brand from product families while keeping the booth visually consistent.',
    bannerAdvice: 'Use the largest banner for company recognition and smaller signs for product families or dealer programs. Confirm whether living material, machinery, or tall displays will obstruct planned sightlines.',
    verifiedFacts: ['The official show runs August 19–21 in Orlando.', 'The organizer lists more than 7,000 attendees and 400 exhibitors.'],
  },
  'southwest-dental-conference': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://swdentalconf.org/',
    venue: 'Hilton Anatole',
    summary: 'The Southwest Dental Conference combines continuing education with an exhibit hall for dental professionals. Exhibitor banners should identify the practice problem, clinical workflow, or business outcome addressed without overstating health or performance claims.',
    bannerAdvice: 'Use a direct category headline and one supported benefit. Keep regulatory, clinical, or technical qualifiers accurate, and give demonstrations and detailed comparisons their own booth signage.',
    verifiedFacts: ['The official conference dates are August 21–22.', 'The official venue is the Hilton Anatole in Dallas.'],
  },
  'california-restaurant-show': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.californiarestaurantshow.com/',
    venue: 'Anaheim Convention Center',
    summary: 'The California Restaurant Show serves restaurant, foodservice, hospitality, and retail buyers. Exhibitor graphics should make the food, equipment, technology, or service category obvious before attendees reach the booth.',
    bannerAdvice: 'Pair one appetite- or application-focused visual with a concise buyer benefit. Leave menus, feature matrices, and tasting instructions to smaller signs where visitors can stop and read.',
    verifiedFacts: ['The official show runs August 23–25 at the Anaheim Convention Center.', 'The organizer promotes more than 250 exhibitors.'],
  },
  'iwf-atlanta': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.iwfatlanta.com/',
    venue: 'Georgia World Congress Center',
    summary: 'IWF Atlanta is a major woodworking technology and manufacturing marketplace. Large machinery and demonstrations can dominate booth sightlines, so banner placement should identify the brand and application even when the product itself blocks part of the display.',
    bannerAdvice: 'Map graphics around machine height, safety zones, and demonstration traffic. Use an overhead or rear-wall brand banner plus smaller application signs close to the relevant equipment.',
    verifiedFacts: ['The official 2026 show runs August 25–28 in Atlanta.', 'The official venue is the Georgia World Congress Center.'],
  },
  'farwest-show': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://farwestshow.com/',
    venue: 'Oregon Convention Center',
    summary: 'Farwest is a nursery and retail horticulture trade show in Portland. Exhibitors can use banners to distinguish plant material, equipment, services, or retail programs while preserving enough open visual space for the products themselves.',
    bannerAdvice: 'Avoid greens that disappear into live plant displays. A contrasting brand panel and short product-family labels can keep the booth readable without competing with the merchandise.',
    verifiedFacts: ['The official show dates are August 26–28.', 'The organizer lists more than 4,000 attendees and 300 exhibitors.'],
  },
  'pwx-2026': {
    reviewedAt: REVIEWED_AT,
    sourceUrl: 'https://www.apwa.org/events/pwx-conference/',
    venue: 'George R. Brown Convention Center',
    summary: 'PWX is the American Public Works Association’s conference and expo for infrastructure and public-works professionals. Booth banners should make the municipal application and buying relevance clear to attendees scanning a broad exhibit floor.',
    bannerAdvice: 'State the infrastructure problem or department served in the headline. Use one credible result or capability beneath it, then direct detailed specifications and procurement information to supporting materials.',
    verifiedFacts: ['The official event runs August 30–September 2 in Houston.', 'The official venue is the George R. Brown Convention Center.'],
  },
};

export const TRADE_SHOWS: TradeShow[] = rows.map((row) => ({
  slug: row[0],
  name: row[1],
  shortName: row[2],
  startDate: row[3],
  endDate: row[4],
  city: row[5],
  state: row[6],
  industry: row[7],
  officialUrl: row[8],
  editorial: editorialBySlug[row[0]],
}));

export const TRADE_SHOW_DIRECTORY_PATH = '/trade-shows';

export function getTradeShowPath(event: Pick<TradeShow, 'slug'>): string {
  return `${TRADE_SHOW_DIRECTORY_PATH}/${event.slug}`;
}

export function getTradeShowBySlug(slug: string | undefined): TradeShow | undefined {
  return TRADE_SHOWS.find((event) => event.slug === slug);
}

export function isIndexableTradeShow(event: TradeShow): event is TradeShow & { editorial: TradeShowEditorial } {
  return Boolean(
    event.editorial?.reviewedAt
    && event.editorial.sourceUrl.startsWith('https://')
    && event.editorial.summary.length >= 120
    && event.editorial.bannerAdvice.length >= 100,
  );
}

export function getAllTradeShowPaths(): string[] {
  return TRADE_SHOWS.map(getTradeShowPath);
}

export function getIndexableTradeShowPaths(): string[] {
  return TRADE_SHOWS.filter(isIndexableTradeShow).map(getTradeShowPath);
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatTradeShowDateRange(event: Pick<TradeShow, 'startDate' | 'endDate'>): string {
  const start = new Date(`${event.startDate}T12:00:00Z`);
  const end = new Date(`${event.endDate}T12:00:00Z`);
  const startLabel = dateFormatter.format(start);
  const endLabel = dateFormatter.format(end);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const endPart = sameMonth ? String(end.getUTCDate()) : endLabel;
  return `${startLabel}–${endPart}, ${end.getUTCFullYear()}`;
}

export function getArtworkReadyDate(startDate: string, businessDays = 5): Date {
  const result = new Date(`${startDate}T12:00:00Z`);
  let remaining = businessDays;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() - 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export function formatMonthDay(date: Date): string {
  return dateFormatter.format(date);
}

function fitMeta(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, Math.max(lastSpace, maxLength - 18))}…`;
}

export function getTradeShowSeo(event: TradeShow): { title: string; description: string } {
  const coreTitle = `${event.shortName} 2026 Exhibitor Guide`;
  const title = fitMeta(
    coreTitle.length <= 34 ? `${coreTitle} | Banners On The Fly` : coreTitle,
    60,
  );
  const description = fitMeta(
    `Plan for ${event.shortName}, ${formatTradeShowDateRange(event)} in ${event.city}, ${event.state}. See event details, exhibitor banner ideas, artwork checks, and the official link.`,
    160,
  );
  return { title, description };
}
