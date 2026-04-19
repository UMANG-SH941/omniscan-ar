export const theme = {
  colors: {
    bg: '#050505',
    bgAlt: '#0a0a0a',
    surface: 'rgba(0,0,0,0.6)',
    surfaceAlt: 'rgba(20,20,20,0.85)',
    border: 'rgba(255,255,255,0.12)',
    borderStrong: 'rgba(255,255,255,0.25)',
    primary: '#00FF66',
    primaryDim: 'rgba(0,255,102,0.25)',
    primaryGlow: 'rgba(0,255,102,0.45)',
    secondary: '#00E5FF',
    secondaryDim: 'rgba(0,229,255,0.25)',
    warning: '#FF3B30',
    text: '#FFFFFF',
    textDim: '#A1A1AA',
    textFaint: '#52525B',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 6,
    md: 12,
    lg: 20,
    xl: 28,
    pill: 999,
  },
  font: {
    mono: 'Courier',
    body: 'System',
  },
};

export const CATEGORIES = [
  { key: 'all', label: 'ALL', icon: 'grid-outline' as const },
  { key: 'plant', label: 'PLANTS', icon: 'leaf-outline' as const },
  { key: 'product', label: 'PRODUCTS', icon: 'cube-outline' as const },
  { key: 'landmark', label: 'LANDMARKS', icon: 'location-outline' as const },
  { key: 'object', label: 'OBJECTS', icon: 'shapes-outline' as const },
  { key: 'animal', label: 'ANIMALS', icon: 'paw-outline' as const },
  { key: 'food', label: 'FOOD', icon: 'restaurant-outline' as const },
  { key: 'other', label: 'OTHER', icon: 'ellipsis-horizontal-outline' as const },
];

export function categoryLabel(c: string) {
  const match = CATEGORIES.find(x => x.key === c);
  return match ? match.label : c.toUpperCase();
}
