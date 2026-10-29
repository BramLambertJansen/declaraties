import { encode } from 'uqr';

// QR-code als SVG (uqr): geen canvas en geen inline style, dus binnen de CSP. Altijd donker op licht (--qr-*).
export function QrCode({ value, label }: { readonly value: string; readonly label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  const path = data
    .flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${String(x)},${String(y)}h1v1h-1z`] : [])))
    .join('');
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      shapeRendering="crispEdges"
      className="size-48 rounded-md"
    >
      <rect width={size} height={size} className="fill-[var(--qr-light)]" />
      <path d={path} className="fill-[var(--qr-dark)]" />
    </svg>
  );
}
