import DOMPurify from 'dompurify'

const svgTags = [
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'rect',
  'defs',
  'clipPath',
  'mask',
  'linearGradient',
  'radialGradient',
  'stop',
  'animate',
  'animateTransform',
  'animateMotion',
  'animateColor',
  'title',
  'desc',
]

const svgAttrs = [
  'class',
  'viewBox',
  'version',
  'xmlns',
  'width',
  'height',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'd',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'transform',
  'attributeName',
  'attributeType',
  'dur',
  'repeatCount',
  'type',
  'values',
  'from',
  'to',
  'begin',
  'fill-rule',
  'clip-rule',
  'offset',
  'stop-color',
  'stop-opacity',
  'p-id',
  'id',
]

export function sanitizeRichHtml(value?: string | null) {
  return DOMPurify.sanitize(value ?? '', {
    ALLOWED_ATTR: ['alt', 'class', 'href', 'rel', 'src', 'style', 'target', 'title'],
    ALLOWED_TAGS: ['a', 'b', 'br', 'div', 'h2', 'h3', 'img', 'li', 'ol', 'p', 'span', 'strong', 'ul'],
  })
}

export function sanitizeSvgHtml(value?: string | null) {
  return DOMPurify.sanitize(value ?? '', {
    ALLOWED_ATTR: svgAttrs,
    ALLOWED_TAGS: svgTags,
    USE_PROFILES: {
      html: false,
      svg: true,
      svgFilters: true,
    },
  })
}

export function htmlToText(value?: string | null) {
  const sanitized = sanitizeRichHtml(value)
  const withLineBreaks = sanitized
    .replaceAll(/<br\s*\/?/gi, '<br')
    .replaceAll(/<br>/gi, '\n')
    .replaceAll(/<\/p>/gi, '\n')
    .replaceAll(/<\/div>/gi, '\n')

  return withLineBreaks.replaceAll(/<[^>]+>/g, '').trim()
}
