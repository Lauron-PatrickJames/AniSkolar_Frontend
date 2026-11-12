import React, { useState } from 'react';

// The campus photo behind the landing page hero and the sign-in page, made
// to load fast on slow connections:
//   1. a 116-byte blurred preview (inline, so it's there instantly),
//   2. the right size for the screen (public/images/hero-640/1280/1920.webp,
//      46–425 KB instead of the 7 MB original), faded in once loaded,
//   3. a green tint on top. index.html preloads the same images.
// The parent needs `relative overflow-hidden`; its content `relative z-10`.

const PLACEHOLDER = 'data:image/webp;base64,UklGRmwAAABXRUJQVlA4IGAAAAAwAwCdASoYAA0APu1orU6ppiSiMAgBMB2JQBadAF+wEqSAAP4mOq1u90I4mjAMIxpF6LCO+43QZfH3OzEsJ3OLCB4/+uyF0hcINjYF2jIS+Q1tHNmTn/vMXV+xw5mwAAA=';
const SRCSET = '/images/hero-640.webp 640w, /images/hero-1280.webp 1280w, /images/hero-1920.webp 1920w';

export default function CampusBackdrop({ tint }: { tint: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 scale-110 bg-cover bg-center blur-xl" style={{ backgroundImage: `url(${PLACEHOLDER})` }} />
      <img
        src="/images/hero-1280.webp"
        srcSet={SRCSET}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
        onLoad={() => setLoaded(true)}
        ref={el => { if (el?.complete) setLoaded(true); }}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="absolute inset-0" style={{ backgroundImage: tint }} />
    </div>
  );
}
