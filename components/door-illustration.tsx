const doorColors = {
  graphite: "#303a38",
  walnut: "#765a44",
  slate: "#596d73",
  olive: "#69715d",
  sand: "#a18a70",
  plum: "#5c454a",
} as const;

export type DoorVariant = keyof typeof doorColors;

type DoorIllustrationProps = {
  variant: DoorVariant;
  label: string;
};

export function DoorIllustration({ variant, label }: DoorIllustrationProps) {
  const color = doorColors[variant];

  return (
    <svg
      aria-label={label}
      className="door-illustration"
      fill="none"
      role="img"
      viewBox="0 0 360 480"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M37 468V91C37 45 70 15 111 15h138c42 0 74 31 74 76v377H37Z" fill="#6C716A" opacity=".18" />
      <path d="M49 469V91c0-38 25-63 63-63h136c37 0 63 26 63 63v378H49Z" fill="#a59c8d" />
      <path d="M64 469V91c0-29 19-48 48-48h135c29 0 48 19 48 48v378H64Z" fill="#d2c8b7" />
      <path d="M78 469V91c0-22 13-35 35-35h131c22 0 35 13 35 35v378H78Z" fill={color} />
      <path d="M81 93c0-22 12-34 34-34h7v405h-41V93Z" fill="#fff" fillOpacity=".06" />
      <path d="M261 91v378h-9V59h1c5 6 8 16 8 32Z" fill="#101816" fillOpacity=".1" />
      <path d="M94 111c0-18 10-28 28-28h110c18 0 29 10 29 28v152H94V111Z" stroke="#E8E3D8" strokeOpacity=".36" strokeWidth="2" />
      <path d="M94 289h167v151H94z" stroke="#E8E3D8" strokeOpacity=".28" strokeWidth="2" />
      <path d="M107 123c0-11 5-16 16-16h108c11 0 17 5 17 16v126H107V123Z" fill="#fff" fillOpacity=".035" />
      <path d="M107 302h141v126H107z" fill="#fff" fillOpacity=".025" />
      <path d="M246 175h3v68h-3z" fill="#E8E3D8" fillOpacity=".18" />
      <circle cx="238" cy="275" r="5.5" fill="#B99560" />
      <path d="M238 281v18" stroke="#B99560" strokeLinecap="round" strokeWidth="3" />
      <path d="M274 89v365" stroke="#E9E1D2" strokeOpacity=".36" strokeWidth="1" />
      <path d="M80 458h195" stroke="#161D1B" strokeOpacity=".26" strokeWidth="3" />
      <path d="M46 469h273" stroke="#59615B" strokeOpacity=".24" strokeWidth="3" />
      <path d="M35 477h289" stroke="#6E736B" strokeOpacity=".18" strokeWidth="2" />
    </svg>
  );
}
