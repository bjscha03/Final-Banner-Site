import type { LocalPageLink, ProductEditorialRecord } from "@/lib/seo/cityData";

interface ExpandedCityProfile {
  city: string;
  state: string;
  venue: string;
  venueContext: string;
  districts: string;
  eventContext: string;
  community: string;
  communityContext: string;
  weatherContext: string;
  sources: Array<[string, string]>;
}

const editorialLinks = (city: string): LocalPageLink[] => [
  {
    label: `Compare vinyl and mesh banners for ${city}`,
    to: "/blog/vinyl-vs-mesh-banners-guide",
    description:
      "Match solid vinyl or airflow-friendly mesh to the mounting surface, exposure, and viewing distance.",
  },
  {
    label: `Choose a readable banner size in ${city}`,
    to: "/blog/perfect-banner-size-guide",
    description:
      "Work backward from the audience distance, available space, and most important line of copy.",
  },
  {
    label: `Plan a ${city} trade-show banner kit`,
    to: "/blog/trade-show-banner-checklist",
    description:
      "Coordinate booth measurements, organizer rules, artwork approvals, packing, and move-in timing.",
  },
  {
    label: `Install outdoor banners safely in ${city}`,
    to: "/blog/banner-installation-hanging-guide",
    description:
      "Review attachment spacing, even tension, hardware choices, inspections, and weather precautions.",
  },
];

const buildEditorial = (
  profile: ExpandedCityProfile,
): ProductEditorialRecord => ({
  introduction: `Banners On The Fly prints custom vinyl banners for ${profile.city} exhibitors, businesses, schools, faith communities, event teams, construction projects, nonprofits, and neighborhood organizations, then ships each completed order to the customer. This locally researched guide supports planning in ${profile.city}, but it does not represent a storefront or pickup location there.`,
  fulfillmentFact:
    "Most standard vinyl-banner orders are produced within 24 hours. Free next-day air is carrier transit after production, and delivery dates are estimates.",
  buyerGuidance: [
    "Choose solid vinyl for protected displays where opacity, saturated color, and a smooth print surface are the priorities.",
    "Consider mesh on approved open fencing and exposed sites because its perforations allow more air to pass through the print.",
    "Measure the real installation area, design for the audience distance, and give each banner one primary message.",
    "Confirm current property, venue, attachment, and municipal rules for the exact display location before installation.",
  ],
  faqs: [
    {
      question: `What banner material works best for outdoor displays in ${profile.city}?`,
      answer: `Solid 13 oz or 15 oz vinyl is a practical choice for protected walls, booths, and short-term displays in ${profile.city}. Mesh is a better starting point for approved open fencing or exposed perimeters where airflow matters. The structure, attachment plan, forecast, and venue rules still determine whether any installation is appropriate.`,
    },
    {
      question: `Can I order trade-show and convention banners for ${profile.venue}?`,
      answer: `Yes. Booth identifiers, table-front graphics, sponsor backdrops, registration signs, and directional banners can be sized for an approved exhibit space. Confirm ${profile.venue} and organizer requirements for dimensions, hanging, fire safety, move-in, and outside services before approving artwork.`,
    },
    {
      question: `How should a grand-opening banner in ${profile.city} be designed?`,
      answer: `Lead with the business name, opening message, date, and one clear next step. Use high contrast, keep secondary details off the main sight line, and test readability from the sidewalk or road. Property approval and current sign rules should be checked for the exact ${profile.city} address.`,
    },
    {
      question: `How early should a ${profile.city} school, church, or event team order banners?`,
      answer:
        "Work backward from the first setup date and allow time for measurements, artwork approval, production, carrier transit, and an inspection buffer. Production and shipping are separate stages, so an event deadline should never be treated as the order date.",
    },
  ],
  localEvidence: [],
  author: "Banners On The Fly editorial",
  reviewer: "Source-verified local SEO review",
  lastReviewed: "2026-08-07",
  claimsApproved: true,
  validationApproved: true,
  evidenceExceptionApproved: true,
  metaTitle: `Vinyl Banner Printing ${profile.city}, ${profile.state} | Fast Shipping`,
  metaDescription: `Custom vinyl banners shipped to ${profile.city}, ${profile.state}. Plan materials, sizing, installation, and event graphics with a locally researched guide.`,
  h1: `Vinyl Banner Printing in ${profile.city}, ${profile.state}`,
  heroSubtitle: `Custom banners for ${profile.city} conventions, events, campuses, storefronts, job sites, and community programs.`,
  localGuide: {
    eyebrow: `${profile.city} banner field guide`,
    title: `A practical banner plan for ${profile.venue}, ${profile.districts}, and ${profile.city} organizations.`,
    summary: `${profile.city} banner projects span meeting halls, commercial districts, campuses, public events, and outdoor sites. The useful choice depends on the audience, mounting surface, exposure, and time on display.`,
    sections: [
      {
        heading: `Meetings and exhibits at ${profile.venue}`,
        paragraphs: [profile.venueContext],
        items: [
          "Measure the approved booth, table, stage, wall, or hanging area instead of estimating from a floor plan image.",
          "Keep the organization name and primary benefit readable across the expected aisle or queue.",
          "Confirm rigging, fire-safety, attachment, delivery, and move-in requirements before production.",
        ],
      },
      {
        heading: `${profile.districts}: events, retail, and street-level messages`,
        paragraphs: [profile.eventContext],
        items: [
          "Give entry, schedule, sponsor, vendor, and wayfinding banners separate jobs so visitors can scan them quickly.",
          "Check sight lines in person and keep windows, exits, accessibility routes, and pedestrian views clear.",
          "Use reusable, date-free designs for recurring markets, annual programs, and seasonal promotions when practical.",
        ],
      },
      {
        heading: `${profile.community}: campuses, employers, and community groups`,
        paragraphs: [profile.communityContext],
        items: [
          "Build a simple visual hierarchy for recruiting, open houses, fundraisers, recognition, safety, and outreach.",
          "Size sponsor marks and directional details for the real viewing distance rather than the design screen.",
          "Label stored banners by program and year so reusable graphics are easy to inspect and redeploy.",
        ],
      },
      {
        heading: `Material and weather planning in ${profile.city}`,
        paragraphs: [profile.weatherContext],
        items: [
          "Spread tension across multiple approved attachment points; never rely on only two corners.",
          "Inspect hardware and the supporting structure during the display period, especially after changing weather.",
          "Take banners down when severe weather is expected and follow the property or event emergency plan.",
        ],
      },
    ],
    recommendations: [
      {
        use: `${profile.venue} booths and indoor sponsor walls`,
        choice: "13 oz or 15 oz solid vinyl",
        reason:
          "A smooth, opaque surface supports saturated graphics, photography, and aisle-facing copy.",
      },
      {
        use: `Approved fence lines and exposed ${profile.city} event perimeters`,
        choice: "Mesh banner material",
        reason:
          "Perforations allow airflow and can reduce wind load compared with a same-size solid banner.",
      },
      {
        use: `Storefront openings around ${profile.districts}`,
        choice: "15 oz solid vinyl",
        reason:
          "A durable option for bold short-term messages where the property and local rules allow display.",
      },
      {
        use: `${profile.community} programs, construction, and repeated setup`,
        choice: "15 oz or 18 oz vinyl",
        reason:
          "Heavier solid material can suit frequent handling and longer campaigns when properly supported.",
      },
    ],
    sourceLinks: profile.sources.map(([label, href]) => ({ label, href })),
  },
  internalLinks: editorialLinks(profile.city),
});

const profiles: Record<string, ExpandedCityProfile> = {
  "new-york-ny": {
    city: "New York City",
    state: "NY",
    venue: "the Javits Center",
    districts: "Times Square, Lower Manhattan, and the boroughs",
    community: "NYU and the city’s nonprofit and business networks",
    venueContext:
      "The Javits Center on Manhattan’s West Side hosts large conventions and trade shows where exhibitors need a coordinated set of booth identification, product messages, registration graphics, and directional signs. In a dense hall, a short headline and one focal image usually outperform a banner packed with details.",
    eventContext:
      "New York’s commercial and cultural activity is distributed across five boroughs rather than one downtown. A restaurant opening in Queens, a community program in Brooklyn, a street event in the Bronx, and a Manhattan retail promotion each present different viewing distances, mounting surfaces, and property controls.",
    communityContext:
      "NYU is one part of an unusually large higher-education and nonprofit ecosystem, while NYC Economic Development Corporation works across industries and neighborhoods. Campus programs, recruiting fairs, cultural organizations, schools, houses of worship, and small businesses all benefit from reusable banners with clear dates, destinations, and calls to action.",
    weatherContext:
      "Coastal storms, thunderstorms, winter weather, heat, and wind between tall buildings make site inspection important. Solid vinyl fits protected walls and interiors; mesh is a better starting point for approved open fencing. A banner should never bridge a sidewalk or railing without authorization, and it should come down when hazardous weather is forecast.",
    sources: [
      ["NYC Tourism + Conventions", "https://www.nyctourism.com/"],
      ["Javits Center", "https://www.javitscenter.com/"],
      ["NYC Economic Development Corporation", "https://edc.nyc/"],
      ["New York University", "https://www.nyu.edu/"],
      ["NYC Parks", "https://www.nycgovparks.org/"],
      ["National Weather Service New York", "https://www.weather.gov/okx/"],
    ],
  },
  "los-angeles-ca": {
    city: "Los Angeles",
    state: "CA",
    venue: "the Los Angeles Convention Center",
    districts: "Downtown, Hollywood, and neighborhood business corridors",
    community: "USC, creative industries, and community organizations",
    venueContext:
      "The Los Angeles Convention Center anchors major meetings and consumer events in Downtown Los Angeles. Booth teams need graphics that remain legible across exhibit aisles, photograph cleanly, and pack in a sequence that matches setup. Measuring each approved surface is more reliable than treating a standard booth footprint as a finished-art dimension.",
    eventContext:
      "Downtown, Hollywood, the Fashion District, and numerous neighborhood corridors create distinct storefront and event conditions. Grand openings, productions, restaurant promotions, street fairs, and nonprofit programs need concise messages designed for pedestrians or moving traffic, not a one-size-fits-all city layout.",
    communityContext:
      "USC supports academic, athletic, cultural, and community programs, while the city’s economic-development work spans entertainment, technology, manufacturing, trade, and small business. Banners can organize recruiting, campus welcomes, production bases, safety zones, fundraisers, and public-facing events without implying a permanent sign.",
    weatherContext:
      "Sun exposure can fade any outdoor graphic over time, while Santa Ana wind events and occasional heavy rain demand conservative mounting. Mesh can help on approved open fencing, but it does not make a structure wind-safe. Inspect attachment points, avoid improvised mounting, and remove displays when site or weather conditions warrant.",
    sources: [
      ["Discover Los Angeles", "https://www.discoverlosangeles.com/"],
      ["Los Angeles Convention Center", "https://www.lacclink.com/"],
      ["LA Economic and Workforce Development", "https://ewdd.lacity.gov/"],
      ["University of Southern California", "https://www.usc.edu/"],
      ["Exposition Park", "https://expositionpark.ca.gov/"],
      [
        "National Weather Service Los Angeles/Oxnard",
        "https://www.weather.gov/lox/",
      ],
    ],
  },
  "san-diego-ca": {
    city: "San Diego",
    state: "CA",
    venue: "the San Diego Convention Center",
    districts: "the Gaslamp Quarter, Balboa Park, and neighborhood centers",
    community:
      "UC San Diego, tourism, life sciences, and military-connected organizations",
    venueContext:
      "The San Diego Convention Center supports large association meetings, trade shows, and fan-focused events beside the waterfront. Exhibitors should coordinate booth identifiers, sponsor panels, queue directions, and after-hours event graphics, then verify hanging and move-in rules with the venue and organizer.",
    eventContext:
      "The Gaslamp Quarter’s hospitality businesses, Balboa Park’s museums and cultural organizations, and neighborhood commercial districts create very different banner uses. Restaurant openings, festivals, museum programs, races, and community events need messages sized for their actual pedestrian routes and approved display areas.",
    communityContext:
      "UC San Diego adds research, recruiting, athletics, and student programming to a regional economy known for tourism, life sciences, technology, and defense activity. Schools, bases and military-connected nonprofits, churches, healthcare teams, and employers can use banners for wayfinding, recognition, hiring, outreach, and ceremonies.",
    weatherContext:
      "San Diego’s mild climate can encourage longer outdoor display periods, but coastal wind, strong sun, and occasional heavy rain still stress fabric and fasteners. Mesh is useful on approved exposed fencing; solid vinyl provides stronger opacity in protected settings. Plan inspections rather than treating favorable weather as maintenance-free.",
    sources: [
      ["San Diego Tourism Authority", "https://www.sandiego.org/"],
      ["San Diego Convention Center", "https://www.visitsandiego.com/"],
      [
        "City of San Diego Economic Development",
        "https://www.sandiego.gov/economic-development",
      ],
      ["UC San Diego", "https://ucsd.edu/"],
      [
        "City of San Diego Balboa Park",
        "https://www.sandiego.gov/park-and-recreation/parks/regional/balboa",
      ],
      ["National Weather Service San Diego", "https://www.weather.gov/sgx/"],
    ],
  },
  "san-francisco-ca": {
    city: "San Francisco",
    state: "CA",
    venue: "Moscone Center",
    districts: "SoMa, Union Square, and neighborhood merchant corridors",
    community:
      "San Francisco State, technology, healthcare, and cultural organizations",
    venueContext:
      "Moscone Center’s buildings in SoMa serve large conventions where visitors move among exhibit halls, meeting rooms, hotels, and off-site programs. A coordinated banner family can identify booths, registration points, sponsor tiers, session routes, and evening events without forcing one graphic to carry the full schedule.",
    eventContext:
      "SoMa, Union Square, Chinatown, the Mission, and other merchant corridors have different storefront forms and pedestrian patterns. Retail promotions, openings, arts events, street fairs, and restaurant programs should be sized to the approved frontage and read in a few seconds on a busy sidewalk.",
    communityContext:
      "San Francisco State contributes campus events and public programs, while technology, healthcare, hospitality, and arts organizations create year-round demand for recruiting, conferences, construction communication, nonprofit outreach, and community celebrations. Reusable systems help teams adapt the same brand to multiple venues.",
    weatherContext:
      "Wind exposure can change sharply between sheltered streets, open waterfront areas, and elevated sites, and fog adds moisture even without rain. Use solid vinyl for protected locations and consider mesh on approved open fencing. Distribute tension, inspect hardware, and never assume perforated material eliminates structural wind risk.",
    sources: [
      ["San Francisco Travel", "https://www.sftravel.com/"],
      ["Moscone Center", "https://www.moscone.com/"],
      [
        "San Francisco Office of Economic and Workforce Development",
        "https://www.sf.gov/departments/office-economic-and-workforce-development",
      ],
      ["San Francisco State University", "https://www.sfsu.edu/"],
      ["San Francisco Recreation and Parks", "https://sfrecpark.org/"],
      ["National Weather Service Bay Area", "https://www.weather.gov/mtr/"],
    ],
  },
  "seattle-wa": {
    city: "Seattle",
    state: "WA",
    venue: "Seattle Convention Center",
    districts: "Downtown, Pike Place Market, and Seattle Center",
    community:
      "the University of Washington, maritime employers, and neighborhood groups",
    venueContext:
      "Seattle Convention Center spans its Arch and Summit buildings in the downtown core. Exhibitors and meeting teams should map graphics to the exact building, level, booth, and setup sequence so registration, sponsor, session, and directional banners guide attendees without ambiguity.",
    eventContext:
      "Pike Place Market, Seattle Center, Downtown, Capitol Hill, and Ballard support markets, restaurants, music, festivals, retail, and cultural programs. Vendor and event banners need to respect compact frontages and dense foot traffic while making names, arrows, times, and entrances easy to scan.",
    communityContext:
      "The University of Washington generates academic, athletics, research, and alumni events, while maritime, technology, healthcare, tourism, and small-business communities add recruiting, safety, open-house, and outreach needs. Durable reusable graphics are useful when programs move between indoor and covered outdoor settings.",
    weatherContext:
      "Frequent wet periods, waterfront exposure, and occasional strong wind make drainage, attachment, and inspections important. Solid vinyl works well under cover or against approved walls; mesh is a better starting point on exposed open fencing. Do not let water pool in folds, and remove displays during hazardous conditions.",
    sources: [
      ["Visit Seattle", "https://visitseattle.org/"],
      ["Seattle Convention Center", "https://seattleconventioncenter.com/"],
      [
        "Seattle Office of Economic Development",
        "https://www.seattle.gov/economic-development",
      ],
      ["University of Washington", "https://www.washington.edu/"],
      ["Seattle Center", "https://www.seattlecenter.com/"],
      ["National Weather Service Seattle", "https://www.weather.gov/sew/"],
    ],
  },
  "portland-or": {
    city: "Portland",
    state: "OR",
    venue: "the Oregon Convention Center",
    districts: "the Central Eastside, downtown, and neighborhood main streets",
    community: "Portland State, makers, nonprofits, and outdoor-industry teams",
    venueContext:
      "The Oregon Convention Center sits in the Lloyd District near the Central Eastside and downtown. Exhibitors need booth, registration, sponsor, and directional graphics that work within the venue plan and remain easy to identify after shipping, storage, and a multi-day setup.",
    eventContext:
      "Portland’s neighborhood business districts, markets, Rose Festival programs, food businesses, and maker events favor direct, human-scale messages. A compact storefront banner, vendor identifier, parade-support graphic, or event entrance should focus on the detail a pedestrian needs next.",
    communityContext:
      "Portland State brings campus and civic programming downtown, while the region’s small manufacturers, outdoor companies, nonprofits, schools, faith communities, and creative businesses use banners for recruiting, launches, fundraisers, workshops, and public events.",
    weatherContext:
      "Long wet stretches call for secure edges, drainage, and routine hardware checks; exposed sites can also see gusty conditions. Mesh is useful on approved open fencing, while solid vinyl offers better opacity under cover. Dry and roll reusable graphics before storage to limit creasing and trapped moisture.",
    sources: [
      ["Travel Portland", "https://www.travelportland.com/"],
      ["Oregon Convention Center", "https://www.oregoncc.org/"],
      ["Prosper Portland", "https://prosperportland.us/"],
      ["Portland State University", "https://www.pdx.edu/"],
      ["Portland Rose Festival", "https://www.rosefestival.org/"],
      ["National Weather Service Portland", "https://www.weather.gov/pqr/"],
    ],
  },
  "las-vegas-nv": {
    city: "Las Vegas",
    state: "NV",
    venue: "the Las Vegas Convention Center",
    districts: "the Strip, Downtown, and the Arts District",
    community: "UNLV, hospitality, entertainment, and convention teams",
    venueContext:
      "The Las Vegas Convention Center serves one of the country’s busiest trade-show markets. Large halls and layered brand environments reward disciplined booth graphics: one promise at aisle distance, clear product categories closer in, and separately packed registration, sponsor, and wayfinding pieces.",
    eventContext:
      "The Strip, Downtown Las Vegas, and the Arts District support resorts, restaurants, nightlife, retail, festivals, and independent businesses. Grand openings and events compete with visually intense surroundings, so a banner needs high contrast and a single action rather than more decorative noise.",
    communityContext:
      "UNLV supports conferences, athletics, student programs, and research, while hospitality, entertainment, construction, healthcare, and convention-service employers create demand for hiring, backstage, safety, recognition, and guest-direction banners.",
    weatherContext:
      "Intense sun and heat can accelerate outdoor wear, and gusty wind can arrive even on otherwise dry days. Mesh may reduce wind load on approved fencing, but shade, attachment strength, inspection, and prompt removal in hazardous conditions still matter. Solid vinyl is strongest visually indoors and in protected placements.",
    sources: [
      ["Visit Las Vegas", "https://www.visitlasvegas.com/"],
      [
        "Las Vegas Convention Center",
        "https://www.vegasmeansbusiness.com/meeting-facilities/las-vegas-convention-center/",
      ],
      [
        "City of Las Vegas Economic Development",
        "https://www.lasvegasnevada.gov/Business/Economic-Development",
      ],
      ["University of Nevada, Las Vegas", "https://www.unlv.edu/"],
      ["Downtown Las Vegas", "https://downtown.vegas/"],
      ["National Weather Service Las Vegas", "https://www.weather.gov/vef/"],
    ],
  },
  "san-antonio-tx": {
    city: "San Antonio",
    state: "TX",
    venue: "the Henry B. González Convention Center",
    districts: "Downtown, the River Walk, and neighborhood commercial centers",
    community:
      "UTSA, healthcare, military, tourism, and small-business networks",
    venueContext:
      "The Henry B. González Convention Center sits beside the River Walk and hosts conventions, meetings, and public events. Exhibitors should coordinate booth graphics with registration, sponsor, and off-site hospitality signs, then confirm venue rules before sending any hanging or oversized piece to production.",
    eventContext:
      "Downtown visitor traffic, Fiesta programs, markets, restaurants, and neighborhood celebrations create needs for entrances, schedules, sponsors, vendors, routes, and grand openings. Each piece should reflect the actual crowd flow and should not obstruct river, sidewalk, doorway, or accessibility sight lines.",
    communityContext:
      "UTSA supports academic, athletics, cultural, and workforce programming. Healthcare, tourism, cybersecurity, military-connected organizations, schools, churches, and small businesses add hiring, outreach, safety, fundraising, and recognition uses across the San Antonio area.",
    weatherContext:
      "Heat, ultraviolet exposure, thunderstorms, and strong wind are central outdoor-display considerations. Use solid vinyl in protected settings and consider mesh on approved open fencing. Provide multiple attachment points, inspect after storms, and remove banners when severe weather is expected.",
    sources: [
      ["Visit San Antonio", "https://www.visitsanantonio.com/"],
      ["Henry B. González Convention Center", "https://www.sahbgcc.com/"],
      [
        "San Antonio Economic Development Department",
        "https://www.sanantonio.gov/EDD",
      ],
      ["University of Texas at San Antonio", "https://www.utsa.edu/"],
      ["Fiesta San Antonio", "https://fiestasanantonio.org/"],
      [
        "National Weather Service Austin/San Antonio",
        "https://www.weather.gov/ewx/",
      ],
    ],
  },
  "fort-worth-tx": {
    city: "Fort Worth",
    state: "TX",
    venue: "the Fort Worth Convention Center",
    districts: "Downtown, the Stockyards, and the Cultural District",
    community:
      "TCU, aviation, logistics, healthcare, and western-sports organizations",
    venueContext:
      "The city-operated Fort Worth Convention Center hosts conventions, trade shows, sports, concerts, and corporate events downtown. Booth and meeting teams benefit from a labeled kit of aisle-facing messages, registration graphics, sponsor walls, and route signs sized to approved venue locations.",
    eventContext:
      "Downtown, the Stockyards, Sundance Square, and the Cultural District attract visitors for museums, western heritage, hospitality, equestrian programs, and festivals. Banners should match the setting: concise pedestrian messages for storefronts and rugged, well-supported plans for approved outdoor event areas.",
    communityContext:
      "TCU adds athletics, student, alumni, and academic events. Aviation and aerospace, transportation and logistics, healthcare, manufacturing, schools, faith groups, livestock organizations, and nonprofits create additional uses for hiring, safety, ceremonies, fundraising, and community outreach.",
    weatherContext:
      "North Texas heat, thunderstorms, hail, and high winds require conservative outdoor planning. Mesh is often preferable on exposed approved fencing, while solid vinyl performs well indoors and against protected surfaces. Never treat a heavier banner as a substitute for an adequate supporting structure.",
    sources: [
      ["Visit Fort Worth", "https://www.fortworth.com/"],
      [
        "City of Fort Worth Convention Center",
        "https://www.fortworthtexas.gov/departments/public-events/convention-center",
      ],
      [
        "Fort Worth Economic Development",
        "https://www.fortworthtexas.gov/departments/ecodev",
      ],
      ["Texas Christian University", "https://www.tcu.edu/"],
      ["Fort Worth Stock Show and Rodeo", "https://www.fwssr.com/"],
      ["National Weather Service Fort Worth", "https://www.weather.gov/fwd/"],
    ],
  },
  "el-paso-tx": {
    city: "El Paso",
    state: "TX",
    venue: "the El Paso Convention Center",
    districts: "Downtown, Union Plaza, and the Mission Valley",
    community:
      "UTEP, cross-border trade, manufacturing, and military-connected groups",
    venueContext:
      "The El Paso Convention Center hosts meetings, consumer programs, performing arts, and civic events downtown. Registration, sponsor, stage, and directional banners should be planned as a system, with dimensions and finishing matched to venue-approved walls, frames, tables, or rigging.",
    eventContext:
      "Downtown and Union Plaza support arts, dining, markets, and visitor events, while the Mission Valley connects businesses and cultural sites along a different corridor. Event and storefront banners need large, high-contrast type that works in bright sun and does not crowd a compact frontage.",
    communityContext:
      "UTEP brings athletics, research, student programs, and public events. International trade, logistics, manufacturing, healthcare, Fort Bliss-connected organizations, schools, churches, and nonprofits add recruiting, safety, bilingual communication, recognition, and outreach needs.",
    weatherContext:
      "Desert sun, heat, dust, and strong wind can be hard on exposed displays. Mesh may help on approved open fencing, but it still requires a sound frame and even tension. Solid vinyl gives better opacity for sheltered areas; inspect fasteners frequently and remove banners during high-wind warnings.",
    sources: [
      ["Visit El Paso", "https://visitelpaso.com/"],
      ["El Paso Convention Center", "https://epconventioncenter.com/"],
      [
        "El Paso Economic and International Development",
        "https://elpasoeid.com/",
      ],
      ["University of Texas at El Paso", "https://www.utep.edu/"],
      ["El Paso Parks and Recreation", "https://www.elpasotexas.gov/parks/"],
      ["National Weather Service El Paso", "https://www.weather.gov/epz/"],
    ],
  },
  "new-orleans-la": {
    city: "New Orleans",
    state: "LA",
    venue: "the New Orleans Ernest N. Morial Convention Center",
    districts:
      "the French Quarter, Warehouse District, and neighborhood corridors",
    community:
      "Tulane, hospitality, port, healthcare, and cultural organizations",
    venueContext:
      "The New Orleans Ernest N. Morial Convention Center stretches along the riverfront beside the Warehouse District. Large meetings require a mapped banner set for exhibit booths, registration, sponsor recognition, session changes, and off-site hospitality rather than one generic piece reused everywhere.",
    eventContext:
      "The French Quarter, Warehouse District, Frenchmen Street, and neighborhood corridors support festivals, music, restaurants, markets, parades, and visitor businesses. Crowd-direction banners must make entrances, routes, schedules, and sponsor information clear without interfering with public ways or historic properties.",
    communityContext:
      "Tulane supports academic, medical, athletic, and alumni programs, while hospitality, port and logistics, energy, healthcare, arts, schools, faith communities, and nonprofits use banners for recruiting, outreach, safety, fundraising, and cultural programs.",
    weatherContext:
      "Heavy rain, tropical weather, high humidity, and sudden wind make outdoor banner plans temporary by design. Mesh is useful on approved open fencing, while solid vinyl suits protected courtyards and indoor venues. Follow emergency guidance and remove banners well before dangerous weather arrives.",
    sources: [
      ["New Orleans & Company", "https://www.neworleans.com/"],
      [
        "New Orleans Ernest N. Morial Convention Center",
        "https://www.mccno.com/",
      ],
      ["New Orleans Business Alliance", "https://www.nolaba.org/"],
      ["Tulane University", "https://tulane.edu/"],
      ["New Orleans City Park", "https://neworleanscitypark.org/"],
      [
        "National Weather Service New Orleans/Baton Rouge",
        "https://www.weather.gov/lix/",
      ],
    ],
  },
  "memphis-tn": {
    city: "Memphis",
    state: "TN",
    venue: "the Renasant Convention Center",
    districts: "Downtown, Beale Street, and the riverfront",
    community:
      "the University of Memphis, logistics, music, and nonprofit networks",
    venueContext:
      "Renasant Convention Center combines exhibit, ballroom, meeting, and performing-arts spaces on the downtown riverfront. Exhibitors and organizers should assign banners to specific halls, entrances, registration points, and setup cases so staff can deploy them in the intended order.",
    eventContext:
      "Beale Street, Downtown, South Main, and the Mississippi riverfront host music, festivals, hospitality, races, and cultural programs. Entry, schedule, sponsor, vendor, and directional banners should be readable in both daytime crowds and evening lighting without carrying unnecessary copy.",
    communityContext:
      "The University of Memphis adds athletics, research, student, and alumni activity, while logistics, healthcare, manufacturing, music, schools, churches, and nonprofits create recruiting, safety, performance, fundraising, and neighborhood-outreach needs.",
    weatherContext:
      "Hot summers, heavy rain, thunderstorms, and riverfront exposure require secure mounting and active monitoring. Mesh may reduce wind load on approved fencing; solid vinyl has stronger opacity for protected sites. Remove banners for severe weather and dry reusable graphics before storage.",
    sources: [
      ["Memphis Travel", "https://www.memphistravel.com/"],
      [
        "Renasant Convention Center",
        "https://www.renasantconventioncenter.com/",
      ],
      ["Greater Memphis Chamber", "https://memphischamber.com/"],
      ["University of Memphis", "https://www.memphis.edu/"],
      ["Memphis River Parks Partnership", "https://www.memphisriverparks.org/"],
      ["National Weather Service Memphis", "https://www.weather.gov/meg/"],
    ],
  },
  "birmingham-al": {
    city: "Birmingham",
    state: "AL",
    venue: "the Birmingham-Jefferson Convention Complex",
    districts: "Uptown, downtown, and historic neighborhood business districts",
    community: "UAB, healthcare, manufacturing, and civil-rights organizations",
    venueContext:
      "The Birmingham-Jefferson Convention Complex brings exhibitions, meetings, sports, concerts, and performing arts together near Uptown. A practical graphics kit separates booth messages, sponsor walls, ticket or registration points, and directional information by building and audience.",
    eventContext:
      "Uptown and downtown support conventions and hospitality, while areas such as Five Points South and Avondale add restaurants, entertainment, retail, and community events. Banners work best when sized to a verified frontage or event zone and limited to the name, message, date, and next step.",
    communityContext:
      "UAB is a major academic and medical presence. Healthcare, advanced manufacturing, finance, construction, schools, churches, nonprofits, and civil-rights institutions use banners for recruiting, patient or visitor direction, ceremonies, safety, fundraising, and education.",
    weatherContext:
      "Heat, humidity, heavy rain, and severe thunderstorms make inspections and a removal plan essential. Mesh is a reasonable starting point on approved exposed fencing; solid vinyl provides greater opacity for sheltered walls and indoor uses. Avoid sagging pockets that can collect water.",
    sources: [
      [
        "Greater Birmingham Convention & Visitors Bureau",
        "https://www.birminghamal.org/",
      ],
      ["Birmingham-Jefferson Convention Complex", "https://www.bjcc.org/"],
      [
        "Birmingham Business Alliance",
        "https://www.birminghambusinessalliance.com/",
      ],
      ["University of Alabama at Birmingham", "https://www.uab.edu/"],
      ["Birmingham Civil Rights Institute", "https://www.bcri.org/"],
      ["National Weather Service Birmingham", "https://www.weather.gov/bmx/"],
    ],
  },
  "savannah-ga": {
    city: "Savannah",
    state: "GA",
    venue: "the Savannah Convention Center",
    districts: "the Historic District, Plant Riverside, and Starland",
    community:
      "SCAD, the port economy, tourism, and preservation-minded organizations",
    venueContext:
      "The Savannah Convention Center sits across the river from the Historic District and serves meetings, trade shows, and events. Exhibitors should coordinate booth and registration graphics with river-crossing logistics, delivery timing, organizer rules, and any off-site program in the downtown core.",
    eventContext:
      "The Historic District, River Street, Plant Riverside, and Starland support hospitality, art, retail, dining, and public events. Banner designs should respect compact or historic frontages, keep pedestrian sight lines clear, and make dates and entrances easy to understand in visitor traffic.",
    communityContext:
      "SCAD contributes exhibitions, student events, recruiting, and creative production, while the Port of Savannah, tourism, logistics, manufacturing, schools, faith groups, and nonprofits create uses for hiring, safety, wayfinding, fundraisers, and cultural programming.",
    weatherContext:
      "Coastal wind, humidity, heavy rain, and tropical weather require cautious outdoor planning. Mesh can help on approved open fencing, while solid vinyl suits sheltered façades and indoor displays. Follow local emergency guidance and remove temporary graphics well before dangerous conditions.",
    sources: [
      ["Visit Savannah", "https://www.visitsavannah.com/"],
      ["Savannah Convention Center", "https://www.savconventioncenter.com/"],
      ["Savannah Economic Development Authority", "https://seda.org/"],
      ["Savannah College of Art and Design", "https://www.scad.edu/"],
      [
        "City of Savannah Parks and Squares",
        "https://www.savannahga.gov/769/Parks-Squares",
      ],
      ["National Weather Service Charleston", "https://www.weather.gov/chs/"],
    ],
  },
  "charleston-sc": {
    city: "Charleston",
    state: "SC",
    venue: "the Charleston Area Convention Center",
    districts: "the peninsula, King Street, and surrounding town centers",
    community:
      "the College of Charleston, port, tourism, and aerospace networks",
    venueContext:
      "The Charleston Area Convention Center in North Charleston hosts conferences, exhibitions, and performing-arts programs. Teams should distinguish between convention-center, coliseum, and off-site graphics, then verify dimensions, delivery, fire-safety, and attachment requirements before production.",
    eventContext:
      "The Charleston peninsula, King Street, and commercial centers across the metro combine historic buildings, hospitality, retail, arts, markets, and festivals. A banner should fit the exact approved property and provide a clear message without overwhelming a narrow frontage or blocking architectural details.",
    communityContext:
      "The College of Charleston supports academic, athletics, student, and alumni events, while port logistics, aerospace, tourism, healthcare, schools, churches, and nonprofits create needs for recruiting, safety, ceremonies, grand openings, fundraising, and community outreach.",
    weatherContext:
      "Coastal wind, salt air, intense rain, heat, and tropical systems can quickly change an outdoor display plan. Mesh is useful on approved open fencing, but no banner should remain up during dangerous weather. Solid vinyl performs best on sheltered walls and indoors where opacity matters.",
    sources: [
      ["Explore Charleston", "https://www.charlestoncvb.com/"],
      [
        "Charleston Area Convention Center",
        "https://www.charlestonconventioncenter.com/",
      ],
      [
        "Charleston County Economic Development",
        "https://www.charlestoncountydevelopment.org/",
      ],
      ["College of Charleston", "https://www.cofc.edu/"],
      ["City of Charleston Parks", "https://www.charleston-sc.gov/179/Parks"],
      ["National Weather Service Charleston", "https://www.weather.gov/chs/"],
    ],
  },
  "virginia-beach-va": {
    city: "Virginia Beach",
    state: "VA",
    venue: "the Virginia Beach Convention Center",
    districts: "the Oceanfront, Town Center, and ViBe Creative District",
    community: "Regent University, tourism, defense, and coastal nonprofits",
    venueContext:
      "The Virginia Beach Convention Center supports conferences, consumer events, sports, and community programs near the Oceanfront. Exhibitors need graphics that transition cleanly from registration to booth, stage, sponsor, and off-site hospitality locations without assuming every surface allows the same hardware.",
    eventContext:
      "The Oceanfront, Town Center, and ViBe Creative District bring together festivals, races, hotels, restaurants, retail, and arts organizations. Event banners should prioritize zone names, entrances, schedules, and sponsor recognition while preserving pedestrian routes and following organizer plans.",
    communityContext:
      "Regent University adds academic and athletics programming, while tourism, defense-connected employers, healthcare, schools, churches, small businesses, and coastal nonprofits use banners for recruiting, ceremonies, outreach, safety, fundraising, and environmental programs.",
    weatherContext:
      "Ocean wind, salt air, thunderstorms, nor’easters, and tropical systems demand a removable, monitored installation. Mesh can be useful on approved open fencing, but the frame and fasteners remain critical. Solid vinyl fits sheltered and indoor placements; remove all temporary graphics before dangerous coastal weather.",
    sources: [
      ["Visit Virginia Beach", "https://www.visitvirginiabeach.com/"],
      [
        "Virginia Beach Convention Center",
        "https://www.visitvirginiabeach.com/meetings/convention-center/",
      ],
      [
        "Virginia Beach Economic Development",
        "https://www.yesvirginiabeach.com/",
      ],
      ["Regent University", "https://www.regent.edu/"],
      [
        "Virginia Beach Parks and Recreation",
        "https://parks.virginiabeach.gov/",
      ],
      ["National Weather Service Wakefield", "https://www.weather.gov/akq/"],
    ],
  },
  "richmond-va": {
    city: "Richmond",
    state: "VA",
    venue: "the Greater Richmond Convention Center",
    districts: "Downtown, Shockoe, and the Arts District",
    community:
      "VCU, state government, finance, healthcare, and creative organizations",
    venueContext:
      "The Greater Richmond Convention Center anchors downtown meetings and exhibitions. Booth teams and planners should map banners to registration, exhibit, session, sponsor, and street-level arrival points, with each item labeled for the room and setup sequence.",
    eventContext:
      "Downtown, Shockoe, Carytown, and the Arts District support restaurants, retail, galleries, markets, and public programs. Grand openings and community events benefit from short pedestrian-facing copy, while race and festival graphics need large arrows, zone names, and sponsor tiers.",
    communityContext:
      "VCU contributes academic, medical, arts, athletics, and student programs. State government, finance, healthcare, logistics, creative businesses, schools, churches, and nonprofits add recruiting, public-information, safety, recognition, and outreach uses.",
    weatherContext:
      "Hot humid weather, thunderstorms, heavy rain, and occasional tropical impacts make outdoor monitoring essential. Mesh suits approved exposed fencing; solid vinyl offers better color and opacity for sheltered displays. Ensure water can drain and remove banners when severe weather is expected.",
    sources: [
      ["Visit Richmond", "https://www.visitrichmondva.com/"],
      ["Greater Richmond Convention Center", "https://www.richmondcenter.com/"],
      ["Greater Richmond Partnership", "https://www.grpva.com/"],
      ["Virginia Commonwealth University", "https://www.vcu.edu/"],
      [
        "Richmond Parks, Recreation and Community Facilities",
        "https://www.rva.gov/parks-recreation",
      ],
      ["National Weather Service Wakefield", "https://www.weather.gov/akq/"],
    ],
  },
  "washington-dc": {
    city: "Washington",
    state: "DC",
    venue: "the Walter E. Washington Convention Center",
    districts: "Downtown, Shaw, and Capitol Riverfront",
    community:
      "universities, associations, nonprofits, and public-sector teams",
    venueContext:
      "The Walter E. Washington Convention Center hosts large association meetings, trade shows, policy conferences, and public events. A coordinated banner kit can separate registration, sponsor, exhibit, session, media, and off-site reception messages while complying with organizer and venue rules.",
    eventContext:
      "Downtown, Shaw, Georgetown, and Capitol Riverfront support hospitality, retail, universities, arts, markets, and waterfront programs. Event graphics must be planned around dense pedestrian traffic and controlled public spaces; precise entrances and venue-approved placement matter more than decorative detail.",
    communityContext:
      "Washington’s universities, associations, embassies, nonprofits, schools, faith communities, contractors, and public-sector organizations create needs for conferences, advocacy events, recruiting, ceremonies, volunteer programs, and community outreach. Neutral, reusable wayfinding can serve multiple annual programs.",
    weatherContext:
      "Summer heat and thunderstorms, heavy rain, winter wind, and occasional snow or tropical remnants can affect outdoor displays. Mesh may reduce wind load on approved open fencing; solid vinyl is stronger visually in protected areas. Public-space and property rules should be checked for the exact site.",
    sources: [
      ["Destination DC", "https://washington.org/"],
      [
        "Walter E. Washington Convention Center",
        "https://eventsdc.com/venue/walter-e-washington-convention-center",
      ],
      ["Washington DC Economic Partnership", "https://wdcep.com/"],
      ["George Washington University", "https://www.gwu.edu/"],
      ["Events DC", "https://eventsdc.com/"],
      [
        "National Weather Service Baltimore/Washington",
        "https://www.weather.gov/lwx/",
      ],
    ],
  },
  "baltimore-md": {
    city: "Baltimore",
    state: "MD",
    venue: "the Baltimore Convention Center",
    districts: "the Inner Harbor, Downtown, and neighborhood main streets",
    community:
      "Johns Hopkins, port, healthcare, education, and arts organizations",
    venueContext:
      "The Baltimore Convention Center connects to downtown hotels and sits near the Inner Harbor and stadium district. Exhibitors need booth, registration, sponsor, and directional graphics that account for multiple entrances, event zones, and the organizer’s freight and installation schedule.",
    eventContext:
      "The Inner Harbor, Downtown, Fells Point, Hampden, and other neighborhood corridors support festivals, restaurants, retail, markets, sports, and cultural events. Street-level banners should focus on names, dates, entrances, and one call to action while respecting compact or historic sites.",
    communityContext:
      "Johns Hopkins contributes medical, research, academic, and athletics programs, while port logistics, healthcare, education, government, arts groups, schools, churches, and nonprofits use banners for recruiting, safety, recognition, fundraising, and outreach.",
    weatherContext:
      "Waterfront exposure, summer thunderstorms, winter wind, and heavy rain make secure finishing and inspections important. Mesh is useful on approved open fencing; solid vinyl performs well indoors or against protected surfaces. Remove temporary displays when hazardous conditions are forecast.",
    sources: [
      ["Visit Baltimore", "https://baltimore.org/"],
      ["Baltimore Convention Center", "https://www.bccenter.org/"],
      [
        "Baltimore Development Corporation",
        "https://www.baltimoredevelopment.com/",
      ],
      ["Johns Hopkins University", "https://www.jhu.edu/"],
      [
        "Baltimore Office of Recreation and Parks",
        "https://bcrp.baltimorecity.gov/",
      ],
      [
        "National Weather Service Baltimore/Washington",
        "https://www.weather.gov/lwx/",
      ],
    ],
  },
  "philadelphia-pa": {
    city: "Philadelphia",
    state: "PA",
    venue: "the Pennsylvania Convention Center",
    districts:
      "Center City, Reading Terminal, and neighborhood commercial corridors",
    community: "Temple, Penn, healthcare, education, and civic organizations",
    venueContext:
      "The Pennsylvania Convention Center occupies multiple blocks in Center City beside Reading Terminal Market. Exhibitors and organizers should label graphics by hall, entrance, booth, and setup phase so registration, sponsorship, aisle messages, and off-site event signs reach the right location.",
    eventContext:
      "Center City, Old City, South Street, University City, and neighborhood corridors support markets, restaurants, historic attractions, retail, arts, and festivals. Banner copy should be concise enough for dense sidewalks and designed around the approved frontage rather than a generic city scale.",
    communityContext:
      "Temple and Penn are part of a broad university and healthcare ecosystem. Education, life sciences, manufacturing, government, schools, faith communities, neighborhood groups, and nonprofits use banners for recruiting, research events, ceremonies, fundraising, safety, and public outreach.",
    weatherContext:
      "Hot humid summers, thunderstorms, winter wind, and freeze-thaw conditions can stress temporary displays. Mesh is appropriate for some approved exposed fences, while solid vinyl provides better opacity under cover. Inspect fasteners and remove banners before severe wind, snow, or ice.",
    sources: [
      ["Visit Philadelphia", "https://www.visitphilly.com/"],
      ["Pennsylvania Convention Center", "https://www.paconvention.com/"],
      [
        "Philadelphia Department of Commerce",
        "https://www.phila.gov/departments/department-of-commerce/",
      ],
      ["Temple University", "https://www.temple.edu/"],
      [
        "Philadelphia Parks & Recreation",
        "https://www.phila.gov/departments/philadelphia-parks-recreation/",
      ],
      [
        "National Weather Service Philadelphia/Mount Holly",
        "https://www.weather.gov/phi/",
      ],
    ],
  },
  "pittsburgh-pa": {
    city: "Pittsburgh",
    state: "PA",
    venue: "the David L. Lawrence Convention Center",
    districts:
      "Downtown, the Strip District, and neighborhood business corridors",
    community:
      "Pitt, Carnegie Mellon, healthcare, robotics, and nonprofit teams",
    venueContext:
      "The David L. Lawrence Convention Center sits downtown beside the Allegheny River and serves trade shows, conferences, and public events. A useful exhibit package maps booth identifiers, sponsor graphics, registration points, and room directions to the organizer’s floor plan and move-in sequence.",
    eventContext:
      "Downtown, the Strip District, Lawrenceville, and other neighborhood corridors support markets, dining, technology, arts, retail, and festivals. Banners should account for hills, bridges, compact storefronts, and pedestrian approaches, with each message reduced to the information needed at that decision point.",
    communityContext:
      "Pitt and Carnegie Mellon generate research, recruiting, athletics, alumni, and cultural programs. Healthcare, robotics, advanced manufacturing, construction, schools, churches, nonprofits, and sports groups add hiring, safety, fundraiser, recognition, and community-event uses.",
    weatherContext:
      "Rain, snow, freeze-thaw cycles, and changing wind around hills and river valleys require frequent inspection. Mesh is useful on approved exposed fencing, while solid vinyl fits indoor and protected settings. Do not allow snow or water to collect in loose material, and remove banners during hazardous weather.",
    sources: [
      ["Visit Pittsburgh", "https://www.visitpittsburgh.com/"],
      ["David L. Lawrence Convention Center", "https://www.pittsburghcc.com/"],
      ["Pittsburgh Regional Alliance", "https://pittsburghregion.org/"],
      ["University of Pittsburgh", "https://www.pitt.edu/"],
      ["Pittsburgh Parks Conservancy", "https://pittsburghparks.org/"],
      ["National Weather Service Pittsburgh", "https://www.weather.gov/pbz/"],
    ],
  },
  "cleveland-oh": {
    city: "Cleveland",
    state: "OH",
    venue: "the Huntington Convention Center of Cleveland",
    districts: "Downtown, the Flats, and neighborhood commercial districts",
    community:
      "Case Western Reserve, healthcare, manufacturing, and cultural institutions",
    venueContext:
      "The Huntington Convention Center connects downtown convention activity with the lakefront and nearby civic venues. Exhibitors should coordinate registration, booth, sponsor, stage, and directional banners as one visual system and confirm which surfaces, frames, or hanging methods are approved.",
    eventContext:
      "Downtown, the Flats, Ohio City, and other neighborhood districts support sports, markets, restaurants, breweries, retail, and festivals. Outdoor and storefront graphics need short copy, strong contrast, and a size based on the actual sidewalk, plaza, or approved event perimeter.",
    communityContext:
      "Case Western Reserve and University Circle institutions add education, research, healthcare, museum, and cultural programs. Manufacturing, logistics, schools, faith groups, nonprofits, and sports organizations use banners for hiring, safety, open houses, fundraisers, exhibits, and recognition.",
    weatherContext:
      "Lake Erie can contribute strong wind, lake-effect snow, rain, and rapid weather changes. Mesh may help on approved open fencing, but temporary displays still require sound structures and prompt removal. Solid vinyl is better for protected locations where opacity and color matter.",
    sources: [
      ["Destination Cleveland", "https://www.thisiscleveland.com/"],
      [
        "Huntington Convention Center of Cleveland",
        "https://www.clevelandconventions.com/",
      ],
      ["Team NEO", "https://northeastohioregion.com/"],
      ["Case Western Reserve University", "https://case.edu/"],
      ["Cleveland Metroparks", "https://www.clevelandmetroparks.com/"],
      ["National Weather Service Cleveland", "https://www.weather.gov/cle/"],
    ],
  },
  "detroit-mi": {
    city: "Detroit",
    state: "MI",
    venue: "Huntington Place",
    districts: "Downtown, Eastern Market, and Midtown",
    community:
      "Wayne State, mobility, manufacturing, healthcare, and arts groups",
    venueContext:
      "Huntington Place is a major riverfront convention venue downtown. Auto, technology, association, and consumer events often require layered booth, press, registration, sponsor, and directional graphics, all labeled to match hall, stand, delivery, and installation plans.",
    eventContext:
      "Downtown, Eastern Market, Midtown, Corktown, and neighborhood corridors support markets, sports, restaurants, cultural institutions, retail, and festivals. Banners for vendors, openings, and public events should be readable amid murals, architecture, crowds, and moving traffic.",
    communityContext:
      "Wayne State contributes academic, medical, athletics, and cultural activity. Automotive and mobility, advanced manufacturing, healthcare, construction, schools, churches, arts organizations, and nonprofits use banners for recruiting, launches, safety, recognition, fundraising, and outreach.",
    weatherContext:
      "Winter snow and wind, freeze-thaw cycles, thunderstorms, and waterfront exposure demand conservative outdoor use. Mesh is a better starting point for approved open fencing; solid vinyl gives stronger opacity indoors and under cover. Clear snow and water risks by removing loose temporary displays.",
    sources: [
      ["Visit Detroit", "https://visitdetroit.com/"],
      ["Huntington Place", "https://www.huntingtonplacedetroit.com/"],
      ["Detroit Economic Growth Corporation", "https://www.degc.org/"],
      ["Wayne State University", "https://wayne.edu/"],
      ["Eastern Market", "https://easternmarket.org/"],
      [
        "National Weather Service Detroit/Pontiac",
        "https://www.weather.gov/dtx/",
      ],
    ],
  },
  "milwaukee-wi": {
    city: "Milwaukee",
    state: "WI",
    venue: "the Baird Center",
    districts: "Downtown, the Historic Third Ward, and the lakefront",
    community:
      "Marquette, manufacturing, brewing, healthcare, and festival organizations",
    venueContext:
      "The Baird Center supports conventions, trade shows, meetings, and public events downtown. Exhibitors should plan a labeled family of booth headlines, sponsor panels, registration graphics, and directions rather than enlarging one design for every location.",
    eventContext:
      "Downtown, the Historic Third Ward, Public Market, and lakefront host restaurants, retail, arts, sports, and festivals including Summerfest. Crowd-facing banners should separate entrances, schedules, sponsor tiers, and vendor identification so each remains legible in dense event environments.",
    communityContext:
      "Marquette contributes athletics, education, research, and alumni programming. Manufacturing, food and beverage, healthcare, construction, schools, churches, community groups, and nonprofits use banners for recruiting, tours, safety, ceremonies, fundraisers, and neighborhood events.",
    weatherContext:
      "Lake Michigan wind, winter snow, ice, and summer thunderstorms can stress temporary displays. Mesh may help on approved exposed fencing, while solid vinyl offers better opacity in protected locations. Remove banners before high wind or accumulating snow and inspect fasteners after temperature swings.",
    sources: [
      ["Visit Milwaukee", "https://www.visitmilwaukee.org/"],
      ["Baird Center", "https://bairdcenter.com/"],
      ["Milwaukee 7", "https://www.mke7.com/"],
      ["Marquette University", "https://www.marquette.edu/"],
      ["Summerfest", "https://www.summerfest.com/"],
      [
        "National Weather Service Milwaukee/Sullivan",
        "https://www.weather.gov/mkx/",
      ],
    ],
  },
  "minneapolis-mn": {
    city: "Minneapolis",
    state: "MN",
    venue: "the Minneapolis Convention Center",
    districts: "Downtown, the North Loop, and the riverfront",
    community:
      "the University of Minnesota, healthcare, food, finance, and arts networks",
    venueContext:
      "The Minneapolis Convention Center serves large meetings and public events on the edge of downtown. Graphics should be assigned to entrances, registration, booths, sponsor areas, and sessions, then packed by setup zone so crews can deploy the correct sizes and hardware efficiently.",
    eventContext:
      "Downtown, the North Loop, Northeast, and Mississippi riverfront support markets, restaurants, retail, arts, sports, races, and festivals. Seasonal outdoor programs need clear route, schedule, vendor, and sponsor banners designed around the approved site and likely viewing distance.",
    communityContext:
      "The University of Minnesota adds major academic, research, medical, athletics, and student programming. Healthcare, food and agriculture, finance, technology, schools, faith groups, nonprofits, and arts organizations use banners for recruiting, conferences, safety, outreach, and recognition.",
    weatherContext:
      "Snow, ice, deep cold, spring storms, and summer heat require genuinely seasonal planning. Solid vinyl fits indoor and protected sites; mesh is useful on some approved open fences when wind is a concern. Do not leave temporary graphics where snow can accumulate or freeze into folds.",
    sources: [
      ["Meet Minneapolis", "https://www.minneapolis.org/"],
      [
        "Minneapolis Convention Center",
        "https://www.minneapolis.org/minneapolis-convention-center/",
      ],
      ["Greater MSP", "https://www.greatermsp.org/"],
      ["University of Minnesota", "https://twin-cities.umn.edu/"],
      [
        "Minneapolis Park and Recreation Board",
        "https://www.minneapolisparks.org/",
      ],
      ["National Weather Service Twin Cities", "https://www.weather.gov/mpx/"],
    ],
  },
  "kansas-city-mo": {
    city: "Kansas City",
    state: "MO",
    venue: "the Kansas City Convention Center",
    districts: "Downtown, the Crossroads, and the River Market",
    community:
      "UMKC, logistics, animal health, engineering, and arts organizations",
    venueContext:
      "The Kansas City Convention Center and its Bartle Hall spaces anchor downtown meetings and exhibitions. Booth, sponsor, stage, registration, and directional graphics should be sized to approved locations and labeled by hall, entrance, and setup phase.",
    eventContext:
      "Downtown, the Crossroads Arts District, Power & Light, and the River Market support conventions, galleries, restaurants, markets, music, sports, and festivals. Street-level banners need bold, brief copy that works for pedestrians and visitors moving between districts.",
    communityContext:
      "UMKC adds academic, healthcare, athletics, arts, and student programs. Logistics, animal health, engineering, food, construction, schools, faith communities, nonprofits, and sports organizations create recruiting, safety, fundraiser, tournament, and public-event uses.",
    weatherContext:
      "Strong thunderstorms, high wind, heat, ice, and winter weather require a removal plan and regular inspections. Mesh can reduce wind load on approved open fencing; solid vinyl delivers better opacity in protected placements. Secure all edges and act early on severe-weather guidance.",
    sources: [
      ["Visit KC", "https://www.visitkc.com/"],
      ["Kansas City Convention Center", "https://kcconvention.com/"],
      ["Kansas City Area Development Council", "https://thinkkc.com/"],
      ["University of Missouri-Kansas City", "https://www.umkc.edu/"],
      ["City Market", "https://thecitymarket.org/"],
      [
        "National Weather Service Kansas City/Pleasant Hill",
        "https://www.weather.gov/eax/",
      ],
    ],
  },
  "omaha-ne": {
    city: "Omaha",
    state: "NE",
    venue: "CHI Health Center Omaha",
    districts: "Downtown, the Old Market, and the riverfront",
    community:
      "Creighton, finance, logistics, food processing, and nonprofit groups",
    venueContext:
      "CHI Health Center Omaha combines convention and arena spaces near downtown and the riverfront. Meeting and event teams should separate exhibit, registration, sponsor, arena, and direction graphics and confirm which loading, hanging, and attachment rules apply to each area.",
    eventContext:
      "Downtown, the Old Market, and the riverfront bring together restaurants, galleries, retail, parks, sports, and festivals. Banners for markets and openings should fit human-scale storefronts, while outdoor-event graphics need large arrows, zone names, and a planned fastening pattern.",
    communityContext:
      "Creighton supports education, healthcare, athletics, and alumni activity. Finance and insurance, logistics, food processing, technology, schools, churches, nonprofits, and youth sports add recruiting, recognition, safety, fundraiser, and community-event uses.",
    weatherContext:
      "Plains wind, severe thunderstorms, heat, snow, and ice all affect temporary displays. Mesh is useful on approved open fences, but it cannot compensate for an undersized structure. Solid vinyl works best in protected locations; remove banners promptly when hazardous weather approaches.",
    sources: [
      ["Visit Omaha", "https://www.visitomaha.com/"],
      ["CHI Health Center Omaha", "https://chihealthcenteromaha.com/"],
      ["Greater Omaha Chamber", "https://www.omahachamber.org/"],
      ["Creighton University", "https://www.creighton.edu/"],
      ["The RiverFront", "https://theriverfrontomaha.com/"],
      ["National Weather Service Omaha/Valley", "https://www.weather.gov/oax/"],
    ],
  },
  "oklahoma-city-ok": {
    city: "Oklahoma City",
    state: "OK",
    venue: "the Oklahoma City Convention Center",
    districts: "Downtown, Bricktown, and Automobile Alley",
    community:
      "Oklahoma City University, energy, aerospace, bioscience, and civic groups",
    venueContext:
      "The Oklahoma City Convention Center serves meetings, exhibitions, and public events beside Scissortail Park. A coordinated kit of registration, booth, sponsor, stage, and directional banners should align with organizer specifications and with the precise indoor or outdoor setup area.",
    eventContext:
      "Downtown, Bricktown, Automobile Alley, and the Boathouse District support hospitality, sports, retail, races, and festivals. Visitor-facing graphics should make entrances, schedules, zones, and calls to action obvious amid broad streets, plazas, and entertainment signage.",
    communityContext:
      "Oklahoma City University adds academic, performing-arts, athletics, and community programs. Energy, aerospace, bioscience, logistics, schools, churches, nonprofits, construction, and sports teams use banners for recruiting, safety, recognition, fundraising, and events.",
    weatherContext:
      "High wind, severe thunderstorms, hail, heat, ice, and tornado risk require cautious outdoor use. Mesh can help on approved open fencing, but every banner needs a removal trigger and a sound support. Solid vinyl offers better opacity in indoor or sheltered placements.",
    sources: [
      ["Visit Oklahoma City", "https://www.visitokc.com/"],
      ["Oklahoma City Convention Center", "https://okcconventioncenter.com/"],
      ["Greater Oklahoma City Chamber", "https://www.greateroklahomacity.com/"],
      ["Oklahoma City University", "https://www.okcu.edu/"],
      ["Scissortail Park", "https://scissortailpark.org/"],
      ["National Weather Service Norman", "https://www.weather.gov/oun/"],
    ],
  },
  "tulsa-ok": {
    city: "Tulsa",
    state: "OK",
    venue: "the Cox Business Convention Center",
    districts: "Downtown, the Arts District, and the Gathering Place corridor",
    community:
      "the University of Tulsa, energy, aerospace, manufacturing, and arts groups",
    venueContext:
      "The Cox Business Convention Center supports downtown conventions, exhibitions, banquets, and public events. Graphics should distinguish between exhibit, ballroom, registration, sponsor, and route uses, with each piece measured and packed for its assigned setup zone.",
    eventContext:
      "Downtown, the Tulsa Arts District, Route 66 corridors, and Gathering Place support galleries, music, restaurants, parks, retail, markets, and festivals. Banners need a simple hierarchy that works for pedestrians, drivers, family crowds, or event queues depending on the approved site.",
    communityContext:
      "The University of Tulsa contributes athletics, education, research, and cultural events. Energy, aerospace, manufacturing, healthcare, schools, churches, nonprofits, and arts organizations use banners for recruiting, safety, performances, fundraising, recognition, and outreach.",
    weatherContext:
      "Strong wind, severe thunderstorms, hail, heat, and winter ice demand durable finishing and early removal. Mesh is a practical option on approved open fencing; solid vinyl gives stronger color and opacity under cover. Inspect attachments frequently during changing Plains weather.",
    sources: [
      ["Visit Tulsa", "https://www.visittulsa.com/"],
      ["Cox Business Convention Center", "https://coxcentertulsa.com/"],
      ["Tulsa Regional Chamber", "https://tulsachamber.com/"],
      ["University of Tulsa", "https://utulsa.edu/"],
      ["Gathering Place", "https://www.gatheringplace.org/"],
      ["National Weather Service Tulsa", "https://www.weather.gov/tsa/"],
    ],
  },
  "albuquerque-nm": {
    city: "Albuquerque",
    state: "NM",
    venue: "the Albuquerque Convention Center",
    districts: "Downtown, Old Town, and Nob Hill",
    community: "UNM, aerospace, film, healthcare, and cultural organizations",
    venueContext:
      "The Albuquerque Convention Center hosts conferences, trade shows, performances, and civic programs downtown. Exhibitors should plan booth, sponsor, registration, and directional graphics around the exact hall and organizer rules, then label each item for a straightforward load-in.",
    eventContext:
      "Downtown, Old Town, Nob Hill, and Balloon Fiesta Park support tourism, restaurants, retail, arts, Route 66 activity, festivals, and major outdoor events. Messages need high contrast in bright light and should be sized for the pedestrian path, field, fence, or approved frontage.",
    communityContext:
      "UNM contributes research, healthcare, athletics, arts, and student events. Aerospace, national-laboratory connections, film, healthcare, construction, schools, pueblos and cultural organizations, faith groups, and nonprofits add recruiting, safety, ceremonies, fundraising, and outreach uses.",
    weatherContext:
      "High-elevation sun, dry air, dust, sudden thunderstorms, and strong wind are important material factors. Mesh can reduce wind load on approved open fencing; solid vinyl is more opaque for sheltered displays. Use even tension and remove banners during high-wind or severe-weather periods.",
    sources: [
      ["Visit Albuquerque", "https://www.visitalbuquerque.org/"],
      ["Albuquerque Convention Center", "https://www.albuquerquecc.com/"],
      ["Albuquerque Regional Economic Alliance", "https://www.abq.org/"],
      ["University of New Mexico", "https://www.unm.edu/"],
      [
        "Albuquerque International Balloon Fiesta",
        "https://balloonfiesta.com/",
      ],
      ["National Weather Service Albuquerque", "https://www.weather.gov/abq/"],
    ],
  },
  "tucson-az": {
    city: "Tucson",
    state: "AZ",
    venue: "the Tucson Convention Center",
    districts: "Downtown, the Mercado District, and Fourth Avenue",
    community:
      "the University of Arizona, optics, aerospace, healthcare, and arts groups",
    venueContext:
      "The Tucson Convention Center combines meeting, arena, and performing-arts facilities downtown. Event teams should match registration, booth, sponsor, stage, and directional banners to the correct building and approved surface, then allow time for delivery and setup checks.",
    eventContext:
      "Downtown, Fourth Avenue, Main Gate Square, and the Mercado District support restaurants, retail, arts, street events, and markets. Bright conditions favor high contrast and uncluttered designs, while compact storefronts require exact measurements and respect for pedestrian sight lines.",
    communityContext:
      "The University of Arizona contributes research, athletics, healthcare, arts, and student programming. Optics, aerospace and defense, bioscience, tourism, schools, churches, nonprofits, and small businesses use banners for recruiting, open houses, safety, fundraising, recognition, and public events.",
    weatherContext:
      "Intense sun, heat, dust, monsoon thunderstorms, and strong outflow winds can shorten outdoor-display life. Mesh is appropriate for some approved open fences; solid vinyl provides greater opacity in protected locations. Inspect often and remove graphics ahead of hazardous winds.",
    sources: [
      ["Visit Tucson", "https://www.visittucson.org/"],
      ["Tucson Convention Center", "https://tucsonconventioncenter.com/"],
      ["Sun Corridor Inc.", "https://suncorridorinc.com/"],
      ["University of Arizona", "https://www.arizona.edu/"],
      [
        "Tucson Parks and Recreation",
        "https://www.tucsonaz.gov/Departments/Parks-and-Recreation",
      ],
      ["National Weather Service Tucson", "https://www.weather.gov/twc/"],
    ],
  },
  "sacramento-ca": {
    city: "Sacramento",
    state: "CA",
    venue: "the SAFE Credit Union Convention Center",
    districts: "Downtown, Midtown, and Old Sacramento Waterfront",
    community:
      "Sacramento State, state government, healthcare, agriculture, and nonprofit groups",
    venueContext:
      "The SAFE Credit Union Convention Center hosts association meetings, exhibitions, and public events downtown. Planners need a coordinated set of registration, booth, sponsor, session, and directional graphics that accounts for hall assignments, loading rules, and off-site programs.",
    eventContext:
      "Downtown, Midtown, and Old Sacramento Waterfront combine government, restaurants, nightlife, retail, museums, farmers markets, and festivals. Banners should use concise messages for pedestrians while protecting entrances, windows, historic features, and event circulation.",
    communityContext:
      "Sacramento State adds academics, athletics, student, and cultural programming. State government, healthcare, agriculture and food, clean technology, construction, schools, faith communities, and nonprofits create uses for recruiting, public information, safety, fundraising, and recognition.",
    weatherContext:
      "Long hot dry periods, strong sun, Delta breezes, winter rain, and wildfire smoke episodes affect outdoor planning. Mesh may help on approved exposed fences, while solid vinyl suits protected displays. Inspect for heat and wind stress and follow site guidance during poor air or fire weather.",
    sources: [
      ["Visit Sacramento", "https://www.visitsacramento.com/"],
      [
        "SAFE Credit Union Convention Center",
        "https://safecreditunionconventioncenter.com/",
      ],
      [
        "Greater Sacramento Economic Council",
        "https://www.greatersacramento.com/",
      ],
      ["Sacramento State", "https://www.csus.edu/"],
      ["Old Sacramento Waterfront", "https://www.oldsacramento.com/"],
      ["National Weather Service Sacramento", "https://www.weather.gov/sto/"],
    ],
  },
  "san-jose-ca": {
    city: "San Jose",
    state: "CA",
    venue: "the San Jose McEnery Convention Center",
    districts: "Downtown, Santana Row, and Japantown",
    community:
      "San José State, technology, manufacturing, and multicultural organizations",
    venueContext:
      "The San Jose McEnery Convention Center hosts technology, association, and consumer events downtown. Exhibitors should divide messaging among booth headlines, product panels, registration, sponsor, and directional graphics, then verify dimensions and rigging before artwork approval.",
    eventContext:
      "Downtown, Santana Row, Willow Glen, and Japantown support dining, retail, arts, festivals, and community programs. Storefront and event banners need strong contrast, exact sizing, and concise copy that works for the intended sidewalk, plaza, or road approach.",
    communityContext:
      "San José State contributes academics, athletics, research, arts, and student programs. Technology, advanced manufacturing, healthcare, construction, schools, faith communities, cultural organizations, and nonprofits use banners for recruiting, launches, safety, festivals, and outreach.",
    weatherContext:
      "Strong sun, dry summers, winter rain, and occasional gusty wind require stable attachment and inspections. Mesh is useful on approved exposed fencing; solid vinyl provides stronger opacity in sheltered placements. Remove banners during high-wind warnings and follow wildfire-related site guidance.",
    sources: [
      ["Visit San Jose", "https://www.sanjose.org/"],
      [
        "San Jose McEnery Convention Center",
        "https://www.sanjose.org/meetings/convention-center",
      ],
      [
        "City of San José Office of Economic Development",
        "https://www.sjeconomy.com/",
      ],
      ["San José State University", "https://www.sjsu.edu/"],
      ["Christmas in the Park", "https://christmasinthepark.com/"],
      ["National Weather Service Bay Area", "https://www.weather.gov/mtr/"],
    ],
  },
  "fresno-ca": {
    city: "Fresno",
    state: "CA",
    venue: "the Fresno Convention & Entertainment Center",
    districts: "Downtown, the Tower District, and the Brewery District",
    community:
      "Fresno State, agriculture, food processing, logistics, and community groups",
    venueContext:
      "The Fresno Convention & Entertainment Center combines exhibit, meeting, arena, and performing-arts spaces downtown. Event teams should create separate graphics for registration, booths, sponsor areas, stages, and directions, then match finishing and packaging to each approved location.",
    eventContext:
      "Downtown, the Tower District, and Brewery District support entertainment, restaurants, arts, small businesses, and community events. Grand-opening and festival banners should prioritize the business or zone name, date, and next action while remaining legible in bright Central Valley light.",
    communityContext:
      "Fresno State adds athletics, academics, agriculture, arts, and student programming. Farming, food processing, logistics, healthcare, construction, schools, churches, nonprofits, and cultural groups use banners for recruiting, fairs, safety, fundraising, recognition, and outreach.",
    weatherContext:
      "Summer heat, intense sun, dust, winter fog, rain, and occasional strong wind shape outdoor use. Solid vinyl works well under cover; mesh may be better for approved exposed fencing. Inspect tension and edges, and follow venue guidance during heat, wind, or poor-air events.",
    sources: [
      ["Visit Fresno County", "https://www.visitfresnocounty.org/"],
      [
        "Fresno Convention & Entertainment Center",
        "https://fresnoconventioncenter.com/",
      ],
      [
        "Fresno County Economic Development Corporation",
        "https://www.fresnoedc.com/",
      ],
      ["Fresno State", "https://www.fresnostate.edu/"],
      [
        "Fresno Parks, After School, Recreation and Community Services",
        "https://www.fresno.gov/parks/",
      ],
      ["National Weather Service Hanford", "https://www.weather.gov/hnx/"],
    ],
  },
  "salt-lake-city-ut": {
    city: "Salt Lake City",
    state: "UT",
    venue: "the Salt Palace Convention Center",
    districts: "Downtown, Granary District, and Sugar House",
    community:
      "the University of Utah, life sciences, technology, finance, and outdoor groups",
    venueContext:
      "The Salt Palace Convention Center anchors major meetings and exhibitions downtown. Exhibitors should map booth, registration, sponsor, session, and directional graphics to the assigned hall and approved hardware, then pack each set in setup order.",
    eventContext:
      "Downtown, the Granary District, and Sugar House support conventions, restaurants, retail, arts, markets, and community events. Banners should account for broad streets, pedestrian plazas, and storefront scale, using short copy and a focal point that remains readable in bright light.",
    communityContext:
      "The University of Utah contributes research, healthcare, athletics, arts, and student programs. Life sciences, technology, finance, outdoor recreation, construction, schools, faith communities, and nonprofits use banners for recruiting, launches, safety, races, fundraising, and outreach.",
    weatherContext:
      "High-elevation sun, winter snow, canyon winds, thunderstorms, and temperature swings require seasonal installation plans. Mesh is useful on approved exposed fences; solid vinyl gives stronger opacity indoors or under cover. Remove banners before high winds or accumulating snow.",
    sources: [
      ["Visit Salt Lake", "https://www.visitsaltlake.com/"],
      ["Salt Palace Convention Center", "https://www.saltpalace.com/"],
      ["Economic Development Corporation of Utah", "https://edcutah.org/"],
      ["University of Utah", "https://www.utah.edu/"],
      ["Downtown Farmers Market", "https://www.slcfarmersmarket.org/"],
      [
        "National Weather Service Salt Lake City",
        "https://www.weather.gov/slc/",
      ],
    ],
  },
  "boise-id": {
    city: "Boise",
    state: "ID",
    venue: "Boise Centre",
    districts: "Downtown, the Linen District, and the Boise River Greenbelt",
    community:
      "Boise State, technology, food production, healthcare, and outdoor groups",
    venueContext:
      "Boise Centre hosts conventions and meetings in the downtown core. Exhibitors should assign graphics to registration, booths, sponsors, stages, and directions, then verify the venue’s approved dimensions, delivery route, hanging methods, and setup schedule.",
    eventContext:
      "Downtown, the Linen District, Hyde Park, and Greenbelt-connected parks support restaurants, retail, arts, markets, races, and festivals. A banner should match its pedestrian or event audience, keep arrows and dates large, and avoid crowding a compact vendor or storefront area.",
    communityContext:
      "Boise State adds athletics, academics, research, and student programs. Technology, food and agriculture, healthcare, construction, government, schools, faith groups, nonprofits, and outdoor organizations create recruiting, safety, fundraiser, race, and recognition uses.",
    weatherContext:
      "Hot dry summers, winter snow, inversions, thunderstorms, and occasional strong wind call for seasonal display plans. Mesh is useful on approved exposed fencing; solid vinyl offers stronger opacity in protected locations. Remove banners for hazardous wind, snow, or poor-air conditions.",
    sources: [
      ["Visit Boise", "https://visitboise.com/"],
      ["Boise Centre", "https://boisecentre.com/"],
      ["Boise Valley Economic Partnership", "https://bvep.org/"],
      ["Boise State University", "https://www.boisestate.edu/"],
      [
        "Boise Parks and Recreation",
        "https://www.cityofboise.org/departments/parks-and-recreation/",
      ],
      ["National Weather Service Boise", "https://www.weather.gov/boi/"],
    ],
  },
  "spokane-wa": {
    city: "Spokane",
    state: "WA",
    venue: "the Spokane Convention Center",
    districts: "Downtown, Riverfront Park, and Kendall Yards",
    community:
      "Gonzaga, healthcare, education, manufacturing, and outdoor organizations",
    venueContext:
      "The Spokane Convention Center overlooks the Spokane River and serves conferences, exhibitions, and community events. Graphics should be mapped to the correct building, hall, booth, registration point, and riverfront approach, with organizer approval for each attachment method.",
    eventContext:
      "Downtown, Riverfront Park, Kendall Yards, and Garland support restaurants, retail, parks, arts, markets, races, and festivals. Event banners need readable entrances, routes, schedules, and sponsor tiers, while storefront messages should stay brief enough for passing pedestrians.",
    communityContext:
      "Gonzaga contributes academics, athletics, alumni, and cultural programs. Healthcare, education, manufacturing, agriculture, schools, churches, nonprofits, and outdoor groups use banners for recruiting, tournaments, safety, fundraisers, recognition, and public events.",
    weatherContext:
      "Snow, ice, summer heat, wildfire smoke, thunderstorms, and gorge-related wind require seasonal planning. Mesh may help on approved exposed fencing; solid vinyl fits protected sites. Remove temporary displays before high winds or accumulating snow and follow event guidance during smoke episodes.",
    sources: [
      ["Visit Spokane", "https://www.visitspokane.com/"],
      ["Spokane Convention Center", "https://www.spokanecenter.com/"],
      ["Greater Spokane Inc.", "https://greaterspokane.org/"],
      ["Gonzaga University", "https://www.gonzaga.edu/"],
      ["Riverfront Spokane", "https://my.spokanecity.org/riverfrontspokane/"],
      ["National Weather Service Spokane", "https://www.weather.gov/otx/"],
    ],
  },
  "colorado-springs-co": {
    city: "Colorado Springs",
    state: "CO",
    venue: "the Broadmoor World Arena and local meeting venues",
    districts: "Downtown, Old Colorado City, and the North Nevada corridor",
    community:
      "UCCS, defense, aerospace, tourism, and Olympic-sport organizations",
    venueContext:
      "Colorado Springs meetings range from Broadmoor World Arena events to hotel, campus, and downtown conference spaces. Because the venue format varies, teams should measure every booth, stage, registration, sponsor, and directional location and confirm which mounting hardware is permitted.",
    eventContext:
      "Downtown, Old Colorado City, Manitou-area visitor corridors, and parks support retail, dining, races, festivals, outdoor recreation, and cultural programs. Banners should be sized for the actual street, trailhead event zone, storefront, or fence rather than the mountain-scale surroundings.",
    communityContext:
      "UCCS contributes research, athletics, academics, and student programs. Defense and aerospace, tourism, healthcare, construction, schools, faith communities, nonprofits, and Olympic and amateur-sport groups use banners for recruiting, ceremonies, races, safety, fundraising, and recognition.",
    weatherContext:
      "High elevation brings intense sun, rapid temperature changes, snow, hail, thunderstorms, and strong wind. Mesh may help on approved open fencing, but all displays need robust attachments and an early removal plan. Solid vinyl is strongest visually in protected areas.",
    sources: [
      ["Visit Colorado Springs", "https://www.visitcos.com/"],
      ["Broadmoor World Arena", "https://www.broadmoorworldarena.com/"],
      [
        "Colorado Springs Chamber & EDC",
        "https://coloradospringschamberedc.com/",
      ],
      ["University of Colorado Colorado Springs", "https://www.uccs.edu/"],
      ["Garden of the Gods Park", "https://gardenofgods.com/"],
      ["National Weather Service Pueblo", "https://www.weather.gov/pub/"],
    ],
  },
  "wichita-ks": {
    city: "Wichita",
    state: "KS",
    venue: "Century II Performing Arts & Convention Center",
    districts: "Downtown, Old Town, and the riverfront",
    community:
      "Wichita State, aerospace, manufacturing, healthcare, and arts groups",
    venueContext:
      "Century II hosts conventions, meetings, performances, and community programs along the Arkansas River. Exhibitors and organizers should separate booth, registration, sponsor, stage, and direction graphics, then confirm approved dimensions and attachments for the event’s assigned spaces.",
    eventContext:
      "Downtown, Old Town, and the riverfront support restaurants, entertainment, markets, museums, races, and festivals. Banner messages should be concise for broad streets and event crowds, with arrows, zone names, and dates given more visual weight than supporting details.",
    communityContext:
      "Wichita State adds research, athletics, academics, and student programs. Aerospace and advanced manufacturing, healthcare, agriculture, schools, churches, nonprofits, and cultural organizations create recruiting, safety, open-house, fundraiser, and recognition uses.",
    weatherContext:
      "Plains wind, severe thunderstorms, hail, heat, ice, and snow require active monitoring. Mesh is useful on approved exposed fencing, while solid vinyl offers better opacity under cover. Use multiple attachment points and remove banners promptly when warnings are issued.",
    sources: [
      ["Visit Wichita", "https://www.visitwichita.com/"],
      ["Century II", "https://www.wichita.gov/717/Century-II"],
      ["Greater Wichita Partnership", "https://greaterwichitapartnership.org/"],
      ["Wichita State University", "https://www.wichita.edu/"],
      ["Riverfest", "https://wichitariverfest.com/"],
      ["National Weather Service Wichita", "https://www.weather.gov/ict/"],
    ],
  },
  "des-moines-ia": {
    city: "Des Moines",
    state: "IA",
    venue: "Iowa Events Center",
    districts: "Downtown, the East Village, and Western Gateway",
    community:
      "Drake, insurance, finance, agriculture, and civic organizations",
    venueContext:
      "Iowa Events Center combines convention, arena, and meeting facilities downtown. Planners should distinguish exhibit, registration, sponsor, stage, and wayfinding banners and label each piece for the correct hall, entrance, delivery, and setup sequence.",
    eventContext:
      "Downtown, the East Village, and Western Gateway support government, retail, restaurants, arts, markets, sports, and festivals. Grand-opening and event graphics should work at pedestrian scale, while fair, race, and park banners need large route names, arrows, and sponsor tiers.",
    communityContext:
      "Drake University contributes academics, athletics, law, arts, and student programs. Insurance and finance, agriculture, government, healthcare, schools, churches, nonprofits, and community groups use banners for recruiting, conferences, safety, fundraisers, and recognition.",
    weatherContext:
      "Strong wind, thunderstorms, heat, snow, ice, and rapid seasonal changes demand regular checks. Mesh can help on approved exposed fencing; solid vinyl gives stronger color in protected spaces. Remove banners before severe storms or accumulating winter weather.",
    sources: [
      ["Catch Des Moines", "https://www.catchdesmoines.com/"],
      ["Iowa Events Center", "https://www.iowaeventscenter.com/"],
      ["Greater Des Moines Partnership", "https://www.dsmpartnership.com/"],
      ["Drake University", "https://www.drake.edu/"],
      [
        "Des Moines Downtown Farmers Market",
        "https://www.dsmpartnership.com/desmoinesfarmersmarket/",
      ],
      ["National Weather Service Des Moines", "https://www.weather.gov/dmx/"],
    ],
  },
  "madison-wi": {
    city: "Madison",
    state: "WI",
    venue: "Monona Terrace Community and Convention Center",
    districts: "Downtown, Capitol Square, and State Street",
    community:
      "UW–Madison, state government, biotech, healthcare, and nonprofit groups",
    venueContext:
      "Monona Terrace hosts meetings, conventions, weddings, and community events on Lake Monona near Capitol Square. Graphics should be tailored to the assigned meeting, registration, exhibit, sponsor, or terrace area and approved before any hanging or exterior setup.",
    eventContext:
      "Capitol Square, State Street, the lakeshore, and neighborhood districts support farmers markets, restaurants, retail, arts, races, festivals, and government events. Banners should keep vendor names, entrances, dates, directions, and sponsor information readable amid dense pedestrian activity.",
    communityContext:
      "UW–Madison contributes research, healthcare, athletics, arts, agriculture, and student programming. State government, biotech, technology, schools, faith communities, nonprofits, and cooperatives use banners for recruiting, conferences, safety, fundraising, outreach, and recognition.",
    weatherContext:
      "Lake wind, snow, ice, thunderstorms, and summer humidity affect temporary installations. Mesh can be useful on approved exposed fencing; solid vinyl suits sheltered and indoor sites. Avoid locations where snow can pile against a banner and remove displays during hazardous weather.",
    sources: [
      ["Destination Madison", "https://www.visitmadison.com/"],
      ["Monona Terrace", "https://www.mononaterrace.com/"],
      ["Madison Region Economic Partnership", "https://madisonregion.org/"],
      ["University of Wisconsin–Madison", "https://www.wisc.edu/"],
      ["Dane County Farmers Market", "https://dcfm.org/"],
      [
        "National Weather Service Milwaukee/Sullivan",
        "https://www.weather.gov/mkx/",
      ],
    ],
  },
  "grand-rapids-mi": {
    city: "Grand Rapids",
    state: "MI",
    venue: "DeVos Place",
    districts: "Downtown, Heartside, and the Medical Mile",
    community:
      "Grand Valley State, healthcare, furniture, manufacturing, and arts groups",
    venueContext:
      "DeVos Place hosts conventions, exhibitions, and performing-arts programs downtown. Exhibitors should coordinate booth headlines, product panels, registration, sponsors, and directions, then pack graphics by hall and setup sequence for efficient move-in.",
    eventContext:
      "Downtown, Heartside, the Medical Mile, and neighborhood business districts support restaurants, breweries, retail, museums, markets, and ArtPrize installations. Event and storefront banners should be concise enough to coexist with art, architecture, and pedestrian traffic.",
    communityContext:
      "Grand Valley State maintains a strong downtown presence alongside its broader academic programs. Healthcare, office furniture and design, advanced manufacturing, food, schools, churches, nonprofits, and arts organizations use banners for recruiting, tours, safety, fundraising, exhibitions, and recognition.",
    weatherContext:
      "Lake-effect snow, rain, freeze-thaw cycles, and strong seasonal wind require planned removal and inspections. Mesh is useful on approved exposed fences, while solid vinyl performs well in protected areas. Do not leave loose graphics where snow or ice can collect.",
    sources: [
      ["Experience Grand Rapids", "https://www.experiencegr.com/"],
      ["DeVos Place", "https://www.devosplace.org/"],
      ["The Right Place", "https://www.rightplace.org/"],
      ["Grand Valley State University", "https://www.gvsu.edu/"],
      ["ArtPrize", "https://www.artprize.org/"],
      ["National Weather Service Grand Rapids", "https://www.weather.gov/grr/"],
    ],
  },
  "buffalo-ny": {
    city: "Buffalo",
    state: "NY",
    venue: "the Buffalo Convention Center",
    districts: "Downtown, Canalside, and Elmwood Village",
    community:
      "the University at Buffalo, healthcare, advanced manufacturing, and cultural groups",
    venueContext:
      "The Buffalo Convention Center serves meetings, exhibitions, and public events downtown. Organizers and exhibitors need a coordinated set of registration, booth, sponsor, stage, and directional banners labeled for the correct room, entrance, and installation sequence.",
    eventContext:
      "Downtown, Canalside, Elmwood Village, and the waterfront support sports, markets, restaurants, retail, festivals, and cultural events. Banner designs should prioritize entrances, routes, dates, and zone names while accounting for pedestrian approaches and lakefront exposure.",
    communityContext:
      "The University at Buffalo contributes research, healthcare, athletics, arts, and student programs. Advanced manufacturing, logistics, healthcare, education, schools, churches, nonprofits, and cultural institutions use banners for recruiting, safety, fundraisers, exhibits, and outreach.",
    weatherContext:
      "Lake Erie wind, heavy lake-effect snow, ice, rain, and thunderstorms require seasonal caution. Mesh may help on approved open fencing, but temporary banners should come down before high wind or accumulating snow. Solid vinyl offers better opacity for indoor and sheltered uses.",
    sources: [
      ["Visit Buffalo Niagara", "https://www.visitbuffaloniagara.com/"],
      ["Buffalo Convention Center", "https://www.buffaloconvention.com/"],
      ["Invest Buffalo Niagara", "https://buffaloniagara.org/"],
      ["University at Buffalo", "https://www.buffalo.edu/"],
      ["Canalside", "https://buffalowaterfront.com/canalside"],
      ["National Weather Service Buffalo", "https://www.weather.gov/buf/"],
    ],
  },
  "rochester-ny": {
    city: "Rochester",
    state: "NY",
    venue: "the Joseph A. Floreano Rochester Riverside Convention Center",
    districts: "Downtown, the Public Market, and Neighborhood of the Arts",
    community:
      "the University of Rochester, optics, imaging, healthcare, and arts groups",
    venueContext:
      "The Joseph A. Floreano Rochester Riverside Convention Center hosts conferences, exhibits, banquets, and public programs downtown. Graphics should be separated by registration, booth, sponsor, stage, and route function and matched to approved venue locations.",
    eventContext:
      "Downtown, the Public Market, Neighborhood of the Arts, and Park Avenue support food vendors, museums, music, retail, festivals, and restaurants. A useful banner system distinguishes vendor names, entrances, schedules, directions, and sponsor recognition without crowding a compact display.",
    communityContext:
      "The University of Rochester contributes research, medicine, music, athletics, and student programs. Optics and imaging, advanced manufacturing, healthcare, education, schools, faith groups, nonprofits, and arts organizations use banners for recruiting, exhibits, safety, fundraising, and recognition.",
    weatherContext:
      "Lake-effect snow, wind, ice, rain, and freeze-thaw cycles demand regular inspections and seasonal removal. Mesh can help on approved open fencing; solid vinyl gives better opacity under cover. Do not allow snow or water to accumulate in sagging material.",
    sources: [
      ["Visit Rochester", "https://www.visitrochester.com/"],
      ["Rochester Riverside Convention Center", "https://www.rrcc.com/"],
      ["Greater Rochester Enterprise", "https://rochesterbiz.com/"],
      ["University of Rochester", "https://www.rochester.edu/"],
      [
        "Rochester Public Market",
        "https://www.cityofrochester.gov/publicmarket/",
      ],
      ["National Weather Service Buffalo", "https://www.weather.gov/buf/"],
    ],
  },
  "providence-ri": {
    city: "Providence",
    state: "RI",
    venue: "the Rhode Island Convention Center",
    districts: "Downtown, Federal Hill, and the Jewelry District",
    community: "Brown, RISD, healthcare, design, and nonprofit organizations",
    venueContext:
      "The Rhode Island Convention Center connects downtown meetings with nearby hotels, arena events, and off-site programs. Exhibitors should plan booth, sponsor, registration, stage, and directional graphics by room and entrance, then confirm approved hanging and delivery methods.",
    eventContext:
      "Downtown, Federal Hill, the Jewelry District, and riverfront parks support restaurants, galleries, design businesses, universities, festivals, and WaterFire events. Banners should remain legible in pedestrian crowds and should identify routes, zones, schedules, or businesses without competing with every surrounding visual.",
    communityContext:
      "Brown and RISD contribute research, academics, arts, design, athletics, and student programs. Healthcare, education, design and manufacturing, schools, faith groups, nonprofits, and cultural organizations use banners for recruiting, exhibitions, fundraisers, ceremonies, and outreach.",
    weatherContext:
      "Coastal wind, heavy rain, winter snow, nor’easters, and tropical remnants make removable installations essential. Mesh may be useful on approved exposed fencing; solid vinyl performs better under cover. Follow event and property plans and remove banners before hazardous weather.",
    sources: [
      ["Go Providence", "https://www.goprovidence.com/"],
      ["Rhode Island Convention Center", "https://www.riconvention.com/"],
      ["Rhode Island Commerce", "https://commerceri.com/"],
      ["Brown University", "https://www.brown.edu/"],
      ["WaterFire Providence", "https://waterfire.org/"],
      [
        "National Weather Service Boston/Norton",
        "https://www.weather.gov/box/",
      ],
    ],
  },
  "boston-ma": {
    city: "Boston",
    state: "MA",
    venue: "the Boston Convention & Exhibition Center",
    districts: "the Seaport, Downtown, and neighborhood commercial centers",
    community:
      "universities, healthcare, life sciences, finance, and nonprofit networks",
    venueContext:
      "The Boston Convention & Exhibition Center anchors major Seaport meetings and trade shows. Exhibitors need graphics that distinguish booth, registration, sponsor, session, and off-site reception uses, with each piece sized to organizer rules and labeled for freight and setup.",
    eventContext:
      "The Seaport, Downtown, Back Bay, Fenway, and neighborhood main streets support conventions, sports, restaurants, universities, retail, races, and festivals. Banners must work within compact pedestrian settings and should give entrances, dates, routes, and calls to action a clear hierarchy.",
    communityContext:
      "Boston’s universities and teaching hospitals create extensive academic, research, medical, athletics, and alumni programming. Life sciences, finance, technology, schools, faith communities, nonprofits, and cultural institutions use banners for conferences, recruiting, fundraisers, exhibits, and public outreach.",
    weatherContext:
      "Coastal wind, nor’easters, heavy rain, snow, ice, and humid summer storms require robust but temporary outdoor plans. Mesh can help on approved open fencing; solid vinyl provides strong opacity in protected areas. Remove banners early when winter or coastal hazards are forecast.",
    sources: [
      ["Meet Boston", "https://www.meetboston.com/"],
      [
        "Boston Convention & Exhibition Center",
        "https://www.signatureboston.com/bcec/",
      ],
      ["Boston Planning Department", "https://www.bostonplans.org/"],
      ["Boston University", "https://www.bu.edu/"],
      [
        "Boston Parks and Recreation",
        "https://www.boston.gov/departments/parks-and-recreation",
      ],
      [
        "National Weather Service Boston/Norton",
        "https://www.weather.gov/box/",
      ],
    ],
  },
  "hartford-ct": {
    city: "Hartford",
    state: "CT",
    venue: "the Connecticut Convention Center",
    districts: "Downtown, Front Street, and Parkville",
    community:
      "Trinity College, insurance, healthcare, government, and arts groups",
    venueContext:
      "The Connecticut Convention Center overlooks the Connecticut River downtown and supports meetings, exhibitions, and public events. Graphics should be assigned to registration, booths, sponsors, sessions, and approach routes and approved for the specific indoor or terrace location.",
    eventContext:
      "Downtown, Front Street, Parkville Market, and neighborhood corridors support restaurants, markets, arts, sports, and community events. Banner copy should be concise for pedestrian and driver sight lines, with the business or zone name, date, direction, and next step easy to scan.",
    communityContext:
      "Trinity College contributes academics, athletics, arts, and student programs. Insurance and financial services, healthcare, government, schools, faith communities, cultural institutions, and nonprofits use banners for recruiting, conferences, public programs, fundraising, and recognition.",
    weatherContext:
      "River-valley wind, winter snow and ice, heavy rain, thunderstorms, and tropical remnants require seasonal removal plans. Mesh may help on approved exposed fencing; solid vinyl works well in protected settings. Inspect attachments after temperature swings and remove banners for hazards.",
    sources: [
      ["Connecticut Convention & Sports Bureau", "https://ctmeetings.org/"],
      ["Connecticut Convention Center", "https://ctconventions.com/"],
      ["MetroHartford Alliance", "https://www.metrohartford.com/"],
      ["Trinity College", "https://www.trincoll.edu/"],
      ["Bushnell Park Conservancy", "https://bushnellpark.org/"],
      [
        "National Weather Service Boston/Norton",
        "https://www.weather.gov/box/",
      ],
    ],
  },
  "newark-nj": {
    city: "Newark",
    state: "NJ",
    venue: "the New Jersey Performing Arts Center and Newark meeting venues",
    districts: "Downtown, the Ironbound, and University Heights",
    community:
      "Rutgers–Newark, transportation, healthcare, education, and arts groups",
    venueContext:
      "Newark events span NJPAC, hotels, arena programs, university spaces, and regional exhibit venues rather than one municipal convention hall. Teams should measure each approved registration, sponsor, stage, booth, and directional location and coordinate freight and installation with that venue.",
    eventContext:
      "Downtown, the Ironbound, University Heights, and Lincoln Park support restaurants, arts, education, sports, retail, festivals, and community programs. Street-facing graphics should be brief, multilingual where the organizer determines it is useful, and sized to the actual pedestrian or traffic approach.",
    communityContext:
      "Rutgers–Newark contributes research, academics, athletics, arts, and student programs. Transportation and logistics, healthcare, education, finance, construction, schools, faith communities, nonprofits, and cultural groups use banners for recruiting, safety, ceremonies, fundraising, and outreach.",
    weatherContext:
      "Wind, winter snow and ice, thunderstorms, heavy rain, and coastal storms make outdoor use temporary. Mesh can help on approved open fences; solid vinyl is stronger visually under cover. Keep exits and sidewalks clear and remove banners before hazardous conditions.",
    sources: [
      [
        "Greater Newark Convention and Visitors Bureau",
        "https://www.newarkhappening.com/",
      ],
      ["New Jersey Performing Arts Center", "https://www.njpac.org/"],
      ["Newark Alliance", "https://newark-alliance.org/"],
      ["Rutgers University–Newark", "https://www.newark.rutgers.edu/"],
      ["Newark City Parks Foundation", "https://newarkcityparks.org/"],
      ["National Weather Service New York", "https://www.weather.gov/okx/"],
    ],
  },
  "honolulu-hi": {
    city: "Honolulu",
    state: "HI",
    venue: "the Hawaiʻi Convention Center",
    districts: "Waikīkī, Downtown, and Kakaʻako",
    community:
      "the University of Hawaiʻi at Mānoa, hospitality, healthcare, and cultural groups",
    venueContext:
      "The Hawaiʻi Convention Center serves meetings and exhibitions near Waikīkī. Shipping time, receiving instructions, booth dimensions, organizer rules, and on-island setup all need to be confirmed before production; each registration, sponsor, booth, and directional graphic should be labeled for its destination.",
    eventContext:
      "Waikīkī, Downtown Honolulu, Kakaʻako, and neighborhood centers support hospitality, retail, arts, markets, festivals, and community programs. Banners should provide concise guest information without implying a local office, and display plans should respect the property, public way, and cultural setting.",
    communityContext:
      "The University of Hawaiʻi at Mānoa contributes research, athletics, arts, cultural, and student programming. Hospitality, healthcare, defense-connected organizations, schools, faith communities, nonprofits, small businesses, and cultural groups use banners for conferences, outreach, ceremonies, fundraising, and recognition.",
    weatherContext:
      "Trade winds, intense ultraviolet exposure, salt air, heavy showers, and tropical weather require frequent inspections and a clear removal plan. Mesh may help on approved open fencing; solid vinyl provides stronger opacity under cover. Never leave a temporary banner up when tropical or high-wind hazards threaten.",
    sources: [
      ["Go Hawaii: Oʻahu", "https://www.gohawaii.com/islands/oahu"],
      [
        "Hawaiʻi Convention Center",
        "https://www.meethawaii.com/convention-center/",
      ],
      ["Oʻahu Economic Development Board", "https://www.oedb.biz/"],
      ["University of Hawaiʻi at Mānoa", "https://manoa.hawaii.edu/"],
      ["Honolulu Parks and Recreation", "https://www.honolulu.gov/parks/"],
      ["National Weather Service Honolulu", "https://www.weather.gov/hfo/"],
    ],
  },
  "anchorage-ak": {
    city: "Anchorage",
    state: "AK",
    venue: "the Dena’ina Civic and Convention Center",
    districts: "Downtown, Spenard, and the Ship Creek area",
    community:
      "UAA, transportation, healthcare, resource, and Alaska Native organizations",
    venueContext:
      "The Dena’ina Civic and Convention Center hosts conferences, exhibitions, and community events downtown. Shipping lead time, receiving, booth dimensions, organizer rules, and setup access should be confirmed before production, with each registration, sponsor, booth, and direction piece clearly labeled.",
    eventContext:
      "Downtown, Spenard, Ship Creek, and trail-connected parks support hospitality, arts, races, markets, tourism, and community programs. Outdoor banners need short high-contrast messages and an installation plan suited to the approved surface, limited daylight season, and real viewing route.",
    communityContext:
      "UAA contributes research, healthcare education, athletics, arts, and student programs. Transportation and logistics, healthcare, resource industries, government, schools, faith groups, nonprofits, and Alaska Native organizations use banners for recruiting, safety, conferences, ceremonies, and outreach.",
    weatherContext:
      "Snow, ice, strong wind, freeze-thaw cycles, cold, and long seasonal light changes require conservative temporary use. Solid vinyl works well indoors and in sheltered areas; mesh may help on approved exposed fencing. Never allow snow or ice to collect, and remove banners when hazards are forecast.",
    sources: [
      ["Visit Anchorage", "https://www.anchorage.net/"],
      [
        "Dena’ina Civic and Convention Center",
        "https://www.anchorageconventioncenters.com/",
      ],
      ["Anchorage Economic Development Corporation", "https://aedcweb.com/"],
      ["University of Alaska Anchorage", "https://www.uaa.alaska.edu/"],
      [
        "Anchorage Parks and Recreation",
        "https://www.muni.org/Departments/parks/Pages/default.aspx",
      ],
      ["National Weather Service Anchorage", "https://www.weather.gov/afc/"],
    ],
  },
};

export const EXPANDED_CITY_VINYL_EDITORIAL: Record<
  string,
  ProductEditorialRecord
> = Object.fromEntries(
  Object.entries(profiles).map(([slug, profile]) => [
    slug,
    buildEditorial(profile),
  ]),
);
