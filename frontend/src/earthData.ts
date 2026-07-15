/**
 * Curated environmental-education dataset for the EARTH tab.
 * Figures are widely published estimates (IPCC AR6, WHO, UN Water, FAO);
 * the simulator is a deliberately simplified teaching model, not science.
 */

export type ClimateFact = { fact: string; future: string };

export const CLIMATE_FACTS: ClimateFact[] = [
  {
    fact: 'Atmospheric CO₂ is ~424 ppm — the highest in at least 2 million years. Pre-industrial level: 280 ppm.',
    future: 'On the current path it passes 550 ppm by 2100, locking in centuries of warming.',
  },
  {
    fact: 'Earth has already warmed ~1.2°C since pre-industrial times.',
    future: 'Current policies point to ~2.5–2.9°C by 2100 — beyond every safe threshold scientists have set.',
  },
  {
    fact: 'Sea level rose about 20 cm in the last century — and the rise is accelerating.',
    future: 'By 2100: +40–80 cm, displacing hundreds of millions from coastal cities like Mumbai and Kolkata.',
  },
  {
    fact: 'Around 10 million hectares of forest are cut every year — a football field every few seconds.',
    future: 'At this pace, most tropical rainforest could be gone or degraded within your lifetime.',
  },
  {
    fact: 'Over 400 million tonnes of plastic are produced each year; less than 10% is ever recycled.',
    future: 'By 2050 the ocean could hold more plastic than fish, by weight.',
  },
  {
    fact: 'Wild vertebrate populations have declined ~70% on average since 1970.',
    future: 'One million species face extinction — many within decades — if habitats keep shrinking.',
  },
  {
    fact: 'Heatwaves that used to strike once a decade now hit ~3× as often.',
    future: 'At +2.7°C, parts of South Asia approach heat-humidity limits of human survival outdoors.',
  },
  {
    fact: 'Glaciers outside the ice sheets have lost over 6,000 billion tonnes of ice since 1993.',
    future: 'Himalayan glaciers feeding the Ganga could lose two-thirds of their ice by 2100, hitting water supply for 1.9 billion people.',
  },
  {
    fact: 'Food systems create about one-third of all greenhouse-gas emissions.',
    future: 'Unchanged diets and waste could alone push warming past 1.5°C, even with clean energy.',
  },
  {
    fact: 'The ocean absorbs ~30% of our CO₂ — and is now 30% more acidic than in 1850.',
    future: 'By 2100, 99% of coral reefs could be lost, and with them a quarter of all marine species.',
  },
  {
    fact: 'Air pollution kills about 7 million people every year — more than most diseases.',
    future: 'Cleaning energy and transport would pay for itself in avoided health costs alone.',
  },
  {
    fact: 'Extreme weather already costs the world over $300 billion a year.',
    future: 'Every 0.1°C avoided saves lives, harvests, and entire coastal economies. The track is a choice.',
  },
];

// ---------------------------------------------------------------------------
// Before / Now / Future comparison — the FUTURE column reacts to the simulator.

export type EraStat = {
  key: string;
  label: string;
  before: string; // ~1850 / pre-industrial
  now: string;
  /** future value at a given projected warming (°C by 2100) */
  future: (warming: number) => string;
};

export const ERA_STATS: EraStat[] = [
  {
    key: 'co2',
    label: 'CO₂ (ppm)',
    before: '280',
    now: '424',
    future: (w) => `${Math.round(340 + w * 80)}`,
  },
  {
    key: 'temp',
    label: 'Warming',
    before: '0°C',
    now: '+1.2°C',
    future: (w) => `+${w.toFixed(1)}°C`,
  },
  {
    key: 'sea',
    label: 'Sea level',
    before: '0 cm',
    now: '+20 cm',
    future: (w) => `+${Math.round(18 + w * 20)} cm`,
  },
  {
    key: 'coral',
    label: 'Coral reefs',
    before: '100%',
    now: '~50%',
    future: (w) => (w <= 1.6 ? '~30% survive' : w <= 2.2 ? '~10% survive' : '<1% survive'),
  },
  {
    key: 'ice',
    label: 'Arctic summer ice',
    before: 'Stable',
    now: '-40%',
    future: (w) => (w <= 1.7 ? 'Some survives' : 'Ice-free summers'),
  },
];

// ---------------------------------------------------------------------------
// "Save the planet" simulator — simplified teaching model.

export type Lever = {
  key: string;
  label: string;
  icon: string; // Ionicons name
  description: string;
  weight: number; // °C of avoided warming at full effort
};

export const LEVERS: Lever[] = [
  {
    key: 'energy',
    label: 'CLEAN ENERGY',
    icon: 'sunny-outline',
    description: 'Replace coal, oil and gas with solar, wind and storage',
    weight: 0.7,
  },
  {
    key: 'forests',
    label: 'FORESTS',
    icon: 'leaf-outline',
    description: 'Stop deforestation and restore degraded land',
    weight: 0.3,
  },
  {
    key: 'industry',
    label: 'INDUSTRY & TRANSPORT',
    icon: 'bus-outline',
    description: 'Electrify transport, green steel and cement',
    weight: 0.4,
  },
  {
    key: 'consumption',
    label: 'CONSUMPTION',
    icon: 'restaurant-outline',
    description: 'Cut food waste, wasteful consumption, and plastic',
    weight: 0.3,
  },
];

export const LEVER_STEPS = 4; // 0..4 effort levels per lever
export const BASELINE_WARMING = 2.9; // °C by 2100 on the current track
export const MIN_WARMING = 1.2; // already locked in

export function projectWarming(levels: Record<string, number>): number {
  let avoided = 0;
  for (const lever of LEVERS) {
    avoided += ((levels[lever.key] ?? 0) / LEVER_STEPS) * lever.weight;
  }
  return Math.max(MIN_WARMING, BASELINE_WARMING - avoided);
}

export function verdictFor(warming: number): { title: string; body: string; tone: 'good' | 'warn' | 'bad' } {
  if (warming <= 1.6) {
    return {
      title: 'PARIS GOAL WITHIN REACH',
      body: 'This is the future scientists say is still possible. Coral survives, coasts stay livable, and the worst tipping points are avoided.',
      tone: 'good',
    };
  }
  if (warming <= 2.0) {
    return {
      title: 'HARD BUT LIVABLE',
      body: 'Serious damage — but adaptation can keep pace. Every extra lever pulled saves millions of lives.',
      tone: 'warn',
    };
  }
  if (warming <= 2.5) {
    return {
      title: 'DANGEROUS TERRITORY',
      body: 'Multiple breadbaskets fail in the same years. Hundreds of millions displaced. Tipping points loom.',
      tone: 'bad',
    };
  }
  return {
    title: 'CATASTROPHIC PATH',
    body: 'This is where "business as usual" leads. Large parts of the tropics become hard to inhabit. It is also entirely avoidable — move the sliders.',
    tone: 'bad',
  };
}

// ---------------------------------------------------------------------------
// Planet vitals: water, air, land, layers.

export const WATER = {
  distribution: [
    { label: 'Salt water (oceans)', pct: 97.5, color: '#1565d8' },
    { label: 'Fresh water', pct: 2.5, color: '#00E5FF' },
  ],
  freshBreakdown: [
    { label: 'Locked in glaciers & ice', pct: 68.7 },
    { label: 'Groundwater', pct: 30.1 },
    { label: 'Rivers, lakes & surface', pct: 1.2 },
  ],
  stats: [
    { value: '~0.5%', label: 'of all Earth’s water is usable fresh water' },
    { value: '2.2 B', label: 'people lack safely managed drinking water' },
    { value: '80%', label: 'of wastewater returns to nature untreated' },
    { value: '~50%', label: 'of the world faces water scarcity at least one month a year' },
  ],
};

export const AIR = {
  stats: [
    { value: '99%', label: 'of humanity breathes air exceeding WHO pollution limits' },
    { value: '7 M', label: 'deaths every year linked to air pollution' },
    { value: '424 ppm', label: 'CO₂ today vs 280 ppm before industry' },
    { value: '+50%', label: 'more CO₂ in the air than at any point in human history' },
  ],
};

export const LAND = {
  stats: [
    { value: '33%', label: 'of Earth’s soils are already degraded' },
    { value: '10 M ha', label: 'of forest lost every year' },
    { value: '3.2 B', label: 'people affected by land degradation' },
    { value: '1 M', label: 'species at risk of extinction' },
  ],
};

export const EARTH_LAYERS = [
  {
    name: 'CRUST',
    depth: '0 – 70 km',
    temp: 'up to ~870°C',
    note: 'The thin rocky shell we live on — thinner, relatively, than an eggshell. All life, soil and water exist here.',
    color: '#19c96a',
  },
  {
    name: 'MANTLE',
    depth: '70 – 2,890 km',
    temp: '~1,000–3,700°C',
    note: 'Slow-flowing hot rock. Its currents move the continents and cause earthquakes and volcanoes.',
    color: '#ffb300',
  },
  {
    name: 'OUTER CORE',
    depth: '2,890 – 5,150 km',
    temp: '~4,000–5,000°C',
    note: 'Liquid iron and nickel. Its swirling generates the magnetic field that shields us from solar radiation.',
    color: '#ff7043',
  },
  {
    name: 'INNER CORE',
    depth: '5,150 – 6,371 km',
    temp: '~5,200°C — as hot as the Sun’s surface',
    note: 'A solid iron ball the size of the Moon, kept solid by crushing pressure.',
    color: '#ff3b30',
  },
];

// ---------------------------------------------------------------------------
// Eco quiz.

export type QuizQuestion = {
  q: string;
  options: string[];
  answer: number; // index into options
  why: string;
};

export const QUIZ: QuizQuestion[] = [
  {
    q: 'How much of Earth’s water is usable fresh water?',
    options: ['~10%', '~2.5%', '~0.5%', '~25%'],
    answer: 2,
    why: 'Only ~0.5% — most fresh water is locked in glaciers or deep underground.',
  },
  {
    q: 'How long does a PET plastic bottle take to break down outdoors?',
    options: ['10 years', '50 years', '450+ years', 'It never changes'],
    answer: 2,
    why: 'Around 450 years or more — and it never truly disappears, it becomes microplastic.',
  },
  {
    q: 'Which everyday change cuts your carbon footprint the most?',
    options: ['Unplugging chargers', 'Eating less red meat', 'Paper straws', 'Shorter showers'],
    answer: 1,
    why: 'Food — especially red meat — is one of the biggest personal levers; chargers are tiny.',
  },
  {
    q: 'How much has Earth warmed since pre-industrial times?',
    options: ['~0.3°C', '~1.2°C', '~3°C', '~5°C'],
    answer: 1,
    why: '~1.2°C already — and every additional 0.1°C measurably increases extremes.',
  },
  {
    q: 'What share of humanity breathes air above WHO pollution limits?',
    options: ['25%', '50%', '75%', '99%'],
    answer: 3,
    why: '99%. Air pollution is linked to ~7 million deaths per year.',
  },
  {
    q: 'Recycling aluminium saves how much of the energy of making it new?',
    options: ['~10%', '~35%', '~70%', '~95%'],
    answer: 3,
    why: '~95% — aluminium is one of the most valuable things you can recycle.',
  },
];

export function quizTitle(score: number, total: number): string {
  const r = score / total;
  if (r === 1) return 'EARTH GUARDIAN';
  if (r >= 0.66) return 'ECO SCHOLAR';
  if (r >= 0.33) return 'CURIOUS EXPLORER';
  return 'JUST GETTING STARTED';
}
