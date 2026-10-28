const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const OverviewIcon = () => (
  <svg {...base} aria-hidden><path d="M2.5 13.5h11M3.5 11l3-4 2.5 2.5L12.5 4" /></svg>
)
export const LibraryIcon = () => (
  <svg {...base} aria-hidden><path d="M3 3.5h10M3 8h10M3 12.5h6" /></svg>
)
export const ModelsIcon = () => (
  <svg {...base} aria-hidden><path d="M2.5 13.5V9M6.5 13.5V5M10.5 13.5V7.5M14 13.5H1.5" /></svg>
)
export const DocsIcon = () => (
  <svg {...base} aria-hidden><path d="M4 1.75h5.5L12.5 4.75v9.5H4zM9.25 1.75v3.25h3.25M6 8.5h4.5M6 11h4.5" /></svg>
)
export const SearchIcon = () => (
  <svg {...base} aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
)
export const MenuIcon = () => (
  <svg {...base} width={20} height={20} aria-hidden><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></svg>
)
export const CloseIcon = () => (
  <svg {...base} width={20} height={20} aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
)
export const ExternalIcon = () => (
  <svg {...base} width={14} height={14} aria-hidden><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" /></svg>
)

/** The product mark: a rise, a peak and a decay, with the sun at the peak. */
export const Mark = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="7" fill="#0038a8" />
    <path d="M5 24 L11 22 L15 8 L18 18 L22 21 L27 23" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx="15" cy="8" r="2.6" fill="#f2c230" />
  </svg>
)
