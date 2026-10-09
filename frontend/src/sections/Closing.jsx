import { useRef, useEffect, useState } from "react";

/**
 * Closing - the last section on the page.
 *
 * Short. Plain. No second pitch.
 * - Why this exists (one paragraph, honest)
 * - Contact / contribute links
 * - Single CTA back to the forecast
 * - Footer with data credits + last-updated timestamp
 *
 * Lazy-loaded via LazySection wrapper.
 * One soft fade-in on viewport entry, nothing more.
 */

/* Data source credits shown in the footer */
const CREDITS = [
  { name: "NASA FIRMS",        url: "https://firms.modaps.eosdis.nasa.gov/" },
  { name: "Open-Meteo",        url: "https://open-meteo.com/" },
  { name: "MODIS/VIIRS AOD",   url: "https://ladsweb.modaps.eosdis.nasa.gov/" },
  { name: "CPCB CAAQMS",       url: "https://cpcb.nic.in/" },
];

/* Placeholder contact / contribute links */
const LINKS = [
  {
    label: "GitHub",
    href: "https://github.com/jas20han-tech/Smoke-Horizon",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
      </svg>
    ),
  },
  {
    label: "Email",
    href: "mailto:contact@smokehorizon.example",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
];

/* Stable build timestamp - updated at build time in a real deployment */
const LAST_UPDATED = new Date().toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function Closing() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced) { setVisible(true); return; }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: "0px 0px -60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [prefersReduced]);

  return (
    <section
      ref={ref}
      id="closing"
      className={`cl-section cl-section--${visible ? "in" : "out"}`}
      aria-labelledby="cl-heading"
    >
      {/* ── Why this exists ── */}
      <div className="cl-body">
        <span className="section-label mono">ABOUT THIS PROJECT</span>

        <h2 className="cl-heading" id="cl-heading">
          Why this exists
        </h2>

        <p className="cl-para">
          Every October and November, farmers across Punjab and Haryana burn
          the stubble left after the rice harvest to clear fields quickly before
          the next wheat sowing. The smoke travels southeast. Delhi-NCR - home
          to roughly 32 million people - has no dedicated advance-warning
          system for when these plumes will arrive or how severe the impact will
          be. Standard AQI apps report what is already happening; they don't
          forecast what is coming.
        </p>

        <p className="cl-para">
          Smoke Horizon is an attempt to close that gap using publicly available
          satellite and atmospheric data. It is not a replacement for
          institutional air quality monitoring; it is a supplementary
          early-warning layer that gives residents, hospitals, and schools a
          usable lead time before the air turns.
        </p>

        {/* ── Contact / contribute ── */}
        <div className="cl-links" role="list">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="cl-link"
              role="listitem"
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {l.icon}
              {l.label}
            </a>
          ))}
          <span className="cl-link-note mono">
            Bug reports and data corrections welcome.
          </span>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="cl-cta-wrap">
        <a href="#dashboard" className="cl-cta">
          See the forecast
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      </div>

      {/* ── Footer ── */}
      <footer className="cl-footer" role="contentinfo">
        <div className="cl-credits">
          <span className="cl-credits-label mono">Data sources</span>
          <ul className="cl-credits-list" role="list">
            {CREDITS.map((c) => (
              <li key={c.name} role="listitem">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cl-credit-link mono"
                >
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="cl-footer-right mono">
          <span className="cl-updated">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-.08-5.9" />
            </svg>
            Updated {LAST_UPDATED}
          </span>
          <span className="cl-license">
            Open data · MIT licence
          </span>
        </div>
      </footer>
    </section>
  );
}
