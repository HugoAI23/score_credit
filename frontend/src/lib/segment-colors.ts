// Color de cada segmento por su nombre base del catálogo (NUNCA por id: los ids cambian al reentrenar)
export const SEGMENT_COLORS: Record<string, string> = {
  Premium: '#5B2A9E',
  'Ahorrador patrimonial': '#1B7F79',
  Estable: '#4A5A73',
  Emergente: '#B7791F',
  Básico: '#B4475F',
}

export const FALLBACK_COLOR = '#7A7F95'

export const colorFor = (baseName?: string) =>
  (baseName && SEGMENT_COLORS[baseName]) || FALLBACK_COLOR
