/** Знак бренда: арка двери с терракотовой ручкой. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18 52V25c0-7.2 5.8-13 13-13h2c7.2 0 13 5.8 13 13v27"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path d="M32 16v36" stroke="currentColor" strokeLinecap="round" strokeWidth="3" opacity="0.55" />
      <circle cx="40" cy="35" fill="currentColor" r="2.6" />
    </svg>
  );
}
