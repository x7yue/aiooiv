interface AiooivLogoProps {
  size?: number;
  className?: string;
  title?: string;
}

export function AiooivLogo({ size = 24, className, title }: AiooivLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="aiooiv-logo-bg" x1="9" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1A1A21" />
          <stop offset="0.52" stopColor="#0D0C0E" />
          <stop offset="1" stopColor="#16110B" />
        </linearGradient>
        <linearGradient id="aiooiv-logo-mint" x1="17" y1="12" x2="51" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7FFFE0" />
          <stop offset="0.58" stopColor="var(--c-accent)" />
          <stop offset="1" stopColor="#0A806E" />
        </linearGradient>
        <linearGradient id="aiooiv-logo-brass" x1="45" y1="16" x2="18" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE29A" />
          <stop offset="1" stopColor="var(--c-accent-2)" />
        </linearGradient>
        <radialGradient id="aiooiv-logo-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(31.8 31.7) rotate(90) scale(25.6)">
          <stop offset="0" stopColor="var(--c-accent)" stopOpacity="0.5" />
          <stop offset="0.56" stopColor="var(--c-accent)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--c-accent)" stopOpacity="0" />
        </radialGradient>
        <filter id="aiooiv-logo-shadow" x="2" y="2" width="60" height="60" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000000" floodOpacity="0.35" />
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#2DD4A8" floodOpacity="0.22" />
        </filter>
      </defs>

      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#aiooiv-logo-bg)" />
      <rect x="4.75" y="4.75" width="54.5" height="54.5" rx="15.25" stroke="#FFFFFF" strokeOpacity="0.08" strokeWidth="1.5" />
      <path d="M13 44.5C20.8 55.2 41.6 56.7 51.1 43.4" stroke="url(#aiooiv-logo-brass)" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      <path d="M15 19.8C23.2 8.8 42 8.4 50.2 19.4" stroke="url(#aiooiv-logo-mint)" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
      <circle cx="32" cy="32" r="22" fill="url(#aiooiv-logo-glow)" />

      <g filter="url(#aiooiv-logo-shadow)">
        <path d="M32 13.5C39.1 13.5 45.3 17.5 48.4 23.4L39.6 24.1L32 13.5Z" fill="url(#aiooiv-logo-mint)" />
        <path d="M48.4 23.4C51.6 29.5 50.9 37.2 46.3 42.8L42.2 34.9L48.4 23.4Z" fill="#1EB997" />
        <path d="M46.3 42.8C41.7 48.3 34.2 50.4 27.5 48.5L32.2 41.1L46.3 42.8Z" fill="url(#aiooiv-logo-brass)" />
        <path d="M27.5 48.5C20.7 46.5 15.6 40.7 14.7 33.7L23.7 36.2L27.5 48.5Z" fill="#D8B95E" />
        <path d="M14.7 33.7C13.8 26.7 17 19.9 22.8 16.1L24.6 25.1L14.7 33.7Z" fill="var(--c-accent)" />
        <path d="M22.8 16.1C25.4 14.4 28.6 13.5 32 13.5L39.6 24.1L24.6 25.1L22.8 16.1Z" fill="#58EBC5" />
        <circle cx="32" cy="32" r="10.4" fill="#0D0C0E" fillOpacity="0.9" stroke="#E8E1C6" strokeOpacity="0.2" strokeWidth="1.2" />
        <circle cx="32" cy="32" r="5.6" fill="var(--c-accent)" fillOpacity="0.16" stroke="#7FFFE0" strokeWidth="1.4" />
        <circle cx="32" cy="32" r="2.25" fill="#F7D87B" />
      </g>

      <path d="M43.4 15.6L47.5 13.1L49.8 17.3" stroke="#FFE29A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.8 46.8L15.1 50.4L11.6 47.5" stroke="var(--c-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
      <rect x="44" y="44" width="4.6" height="4.6" rx="1.1" fill="var(--c-accent)" />
      <rect x="50" y="38.2" width="3.4" height="3.4" rx="0.9" fill="var(--c-accent-2)" />
      <rect x="10.8" y="22" width="3.2" height="3.2" rx="0.85" fill="var(--c-accent)" fillOpacity="0.72" />
    </svg>
  );
}
