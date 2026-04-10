import type { ReactElement } from "react";

const ACCENT_STARS = [
  { left: "12%", top: "20%", size: "0.28rem", delay: "-4s", duration: "10s" },
  { left: "23%", top: "34%", size: "0.18rem", delay: "-8s", duration: "12s" },
  { left: "36%", top: "15%", size: "0.22rem", delay: "-1s", duration: "9s" },
  { left: "48%", top: "28%", size: "0.2rem", delay: "-6s", duration: "14s" },
  { left: "64%", top: "18%", size: "0.3rem", delay: "-3s", duration: "11s" },
  { left: "18%", top: "12%", size: "0.16rem", delay: "-5s", duration: "11s" },
  { left: "31%", top: "26%", size: "0.24rem", delay: "-10s", duration: "13s" },
  { left: "57%", top: "12%", size: "0.18rem", delay: "-12s", duration: "9s" },
  { left: "74%", top: "31%", size: "0.16rem", delay: "-7s", duration: "13s" },
  { left: "82%", top: "14%", size: "0.24rem", delay: "-2s", duration: "10s" },
  { left: "88%", top: "38%", size: "0.18rem", delay: "-9s", duration: "15s" },
];

export function MagnumBackground(): ReactElement {
  return (
    <div
      className="magnum-background magnum-backdrop magnum-backdrop--lite"
      aria-hidden="true"
    >
      <div className="magnum-backdrop__sky"></div>
      <div className="magnum-backdrop__vault"></div>
      <div className="magnum-backdrop__horizon"></div>

      <div className="magnum-backdrop__orbit magnum-backdrop__orbit--sun">
        <div className="magnum-backdrop__light magnum-backdrop__light--sun">
          <span className="magnum-backdrop__orb magnum-backdrop__orb--sun"></span>
        </div>
      </div>

      <div className="magnum-backdrop__orbit magnum-backdrop__orbit--moon">
        <div className="magnum-backdrop__light magnum-backdrop__light--moon">
          <span className="magnum-backdrop__orb magnum-backdrop__orb--moon"></span>
        </div>
      </div>

      <div className="magnum-backdrop__stars magnum-backdrop__stars--far"></div>

      <div className="magnum-backdrop__ratio-shell">
        <svg
          className="magnum-backdrop__ratio"
          viewBox="0 0 610 377"
          role="presentation"
          focusable="false"
        >
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect
              className="magnum-backdrop__ratio-guide"
              x="40"
              y="24"
              width="530"
              height="328"
              rx="164"
            ></rect>
            <path
              className="magnum-backdrop__ratio-guide"
              d="M367 24V352"
            ></path>
            <path
              className="magnum-backdrop__ratio-guide"
              d="M367 149H570"
            ></path>
            <path
              className="magnum-backdrop__ratio-guide"
              d="M242 149V352"
            ></path>
            <path
              className="magnum-backdrop__ratio-guide"
              d="M242 226H367"
            ></path>
            <path
              className="magnum-backdrop__ratio-guide"
              d="M290 226V352"
            ></path>
            <path
              className="magnum-backdrop__ratio-arc"
              d="M367 24A203 203 0 0 1 164 227"
            ></path>
            <path
              className="magnum-backdrop__ratio-arc"
              d="M367 149A125 125 0 0 1 242 274"
            ></path>
            <path
              className="magnum-backdrop__ratio-arc"
              d="M242 149A77 77 0 0 1 319 226"
            ></path>
            <path
              className="magnum-backdrop__ratio-arc"
              d="M242 226A48 48 0 0 1 194 274"
            ></path>
          </g>
        </svg>
      </div>

      <div className="magnum-backdrop__sigil-shell">
        <svg
          className="magnum-backdrop__sigil"
          viewBox="0 0 220 280"
          role="presentation"
          focusable="false"
        >
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path
              className="magnum-backdrop__sigil-outline"
              d="M110 22c19 0 34 14 37 34 11 3 19 11 22 21 11 1 20 11 20 22 0 12-9 22-21 22 7 18 5 37-6 54-11 18-29 34-52 48-23-14-41-30-52-48-11-17-13-36-6-54-12 0-21-10-21-22 0-11 9-21 20-22 3-10 11-18 22-21 3-20 18-34 37-34Z"
            ></path>
            <path
              className="magnum-backdrop__sigil-eye"
              d="M68 116c17-20 31-30 42-30s25 10 42 30c-17 20-31 30-42 30s-25-10-42-30Z"
            ></path>
            <circle
              className="magnum-backdrop__sigil-core"
              cx="110"
              cy="116"
              r="9"
            ></circle>
            <path
              className="magnum-backdrop__sigil-iris"
              d="M110 97c10 0 19 8 19 19"
            ></path>
            <path
              className="magnum-backdrop__sigil-ray"
              d="M110 38v20M143 54l-13 14M77 54l13 14"
            ></path>
            <path
              className="magnum-backdrop__sigil-ray"
              d="M88 164c7 10 14 16 22 16s15-6 22-16"
            ></path>
            <path
              className="magnum-backdrop__sigil-spiral"
              d="M156 38v42h-42v42H72v42"
            ></path>
            <path
              className="magnum-backdrop__sigil-spiral"
              d="M156 80a42 42 0 0 1-42 42"
            ></path>
          </g>
        </svg>
      </div>

      <div className="magnum-backdrop__accents">
        {ACCENT_STARS.map((star, index) => (
          <span
            key={index}
            className="magnum-backdrop__accent-star"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          ></span>
        ))}
      </div>

      <div className="magnum-backdrop__vignette"></div>
    </div>
  );
}
