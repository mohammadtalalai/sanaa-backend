export default function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    bag: 'M5 7h14l2 14H3L5 7z M9 7V5a3 3 0 016 0v2',
    box: 'M3 7l9-5 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10',
    tool: 'M14 3a6 6 0 00-7 7L2 17l5 5 7-7a6 6 0 007-7l-4 4-5-5 4-4z',
    factory: 'M3 21V9l6 4V9l6 4V3h6v18H3z M6 17h2 M11 17h2 M17 17h2',
    truck: 'M2 5h13v12H2z M15 9h4l3 4v4h-7 M5 20a2 2 0 100-4 2 2 0 000 4z M18 20a2 2 0 100-4 2 2 0 000 4z',
    wallet: 'M3 5h17v15H3z M3 5V3h14 M15 10h7v6h-7z M18 13h1',
    spark: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z',
    settings: 'M9 3h6l1 4 4 1 2 5-3 3v4l-5 2-3-3-4 1-3-5 3-3V8l5-2z M12 9a3 3 0 100 6 3 3 0 000-6',
    check: 'M5 12l4 4L19 6',
    bell: 'M5 17V9a7 7 0 0114 0v8l2 2H3l2-2z M10 22h4',
    search: 'M10 17a7 7 0 110-14 7 7 0 010 14z M15 15l6 6',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    plus: 'M12 5v14 M5 12h14',
    down: 'M6 9l6 6 6-6',
    moon: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z',
    users: 'M9 11a4 4 0 100-8 4 4 0 000 8z M2 21v-3a7 7 0 0114 0v3 M17 4a4 4 0 010 8 M19 15a5 5 0 013 6',
    clock: 'M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2',
    logout: 'M9 3H3v18h6 M9 12h13 M17 7l5 5-5 5',
    shield: 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4z M8 12l3 3 5-6',
    file: 'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h8',
    more: 'M4 12h1 M11 12h1 M18 12h1',
    close: 'M5 5l14 14 M5 19L19 5',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6',
    refresh: 'M20 8a9 9 0 10.5 7 M20 2v6h-6',
    chart: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16V4',
    globe: 'M12 22a10 10 0 100-20 10 10 0 000 20z M2 12h20 M12 2c6 6 6 14 0 20-6-6-6-14 0-20',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}
