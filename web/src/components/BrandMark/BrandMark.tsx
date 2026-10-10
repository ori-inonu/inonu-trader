export default function BrandMark({
  size = 48,
  decorative = false,
}: {
  size?: 24 | 32 | 48;
  decorative?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "INONU TRADER"}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      <rect x="1" y="1" width="62" height="62" rx="17" fill="#0C1D31" stroke="#5C7D98" strokeWidth="1.5" />
      <path d="M18 46V18h10M18 46L46 18v28H36" stroke="#5FE1F5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="46" r="4" fill="#5FE1F5" />
      <circle cx="46" cy="18" r="4" fill="#E9C677" />
      <path d="M9 34h5M50 30h5" stroke="#E9C677" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
