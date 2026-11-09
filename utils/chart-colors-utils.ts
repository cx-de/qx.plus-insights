// Chart.js cannot read CSS classes, so charts pull the theme tokens from
// assets/tailwind.css at draw time. Read them again after a theme switch.

const CHART_SLOTS = 12;

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// An HSL token ("222 47% 11%") as a colour with optional alpha.
// Comma hsla(): Chart.js cannot parse "hsl(H S L / a)" and derives undefined hover colours from it.
export const chartTokenColor = (name: string, alpha = 1): string | undefined => {
  const parts = cssVar(name).split(/\s+/).filter(Boolean);
  return parts.length === 3 ? `hsla(${parts.join(', ')}, ${alpha})` : undefined;
};

// The categorical slice and line palette for the current theme.
export const chartPalette = (): string[] => {
  const colors: string[] = [];
  for (let i = 1; i <= CHART_SLOTS; i++) {
    const value = cssVar(`--chart-${i}`);
    if (value) colors.push(value);
  }
  return colors.length ? colors : ['#3b5b84', '#a03f78', '#6f9a22', '#ca9b4f'];
};

export const chartCashColor = (): string => cssVar('--chart-cash') || '#dc2626';

// Calls `onChange` when the dashboard flips between light and dark.
export const chartOnThemeChange = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};
