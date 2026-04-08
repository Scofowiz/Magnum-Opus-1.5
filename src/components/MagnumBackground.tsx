/**
 * MagnumSkyBackground.tsx
 *
 * Real-time day/night cycle driven by:
 *   • Local clock  — actual time of day, no speed multiplier
 *   • Open-Meteo   — free, no API key, auto-detected by lat/lon
 *
 * Weather affects:
 *   • Cloud cover  — grey veil over the sky, dims sun/moon/stars
 *   • Rain         — animated diagonal streaks
 *   • Snow         — slow drifting particles
 *   • Fog          — low white haze layer
 *   • Thunderstorm — rain + occasional white flash
 *
 * Usage:
 *   <MagnumSkyBackground />
 *
 * No props required. Geolocation is requested on mount.
 * Weather refreshes every 10 minutes automatically.
 */

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WeatherType =
  | "clear"
  | "partly"
  | "overcast"
  | "fog"
  | "rain"
  | "snow"
  | "thunder";

interface Weather {
  type: WeatherType;
  clouds: number; // 0–1
}

type RGB = [number, number, number];

interface Keyframe {
  t: number;
  top: RGB;
  bot: RGB;
  sun: number;
  moon: number;
  stars: number;
}

interface SkyState {
  top: RGB;
  bot: RGB;
  sun: number;
  moon: number;
  stars: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
}

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  driftSpeed: number;
}

interface OrbitalPos {
  x: number;
  y: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpRGB = (c1: RGB, c2: RGB, t: number): RGB => [
  lerp(c1[0], c2[0], t),
  lerp(c1[1], c2[1], t),
  lerp(c1[2], c2[2], t),
];
const rgb = ([r, g, b]: RGB, a: number = 1): string =>
  a < 1
    ? `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`
    : `rgb(${r | 0},${g | 0},${b | 0})`;
const h = (hex: string): RGB => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

// ─── Sky keyframes ────────────────────────────────────────────────────────────
// Colours pulled 1:1 from magnum-backdrop-sky-cycle keyframes.
// t = minutes since midnight (0–1440).

const KEYS: Keyframe[] = [
  {
    t: 0,
    top: h("#081123"),
    bot: h("#403550"),
    sun: 0.0,
    moon: 0.85,
    stars: 1.0,
  },
  {
    t: 240,
    top: h("#0f1a30"),
    bot: h("#3d3550"),
    sun: 0.0,
    moon: 0.7,
    stars: 0.85,
  },
  {
    t: 330,
    top: h("#2b3d65"),
    bot: h("#b26242"),
    sun: 0.02,
    moon: 0.2,
    stars: 0.2,
  },
  {
    t: 390,
    top: h("#4d6eaa"),
    bot: h("#ffc997"),
    sun: 0.55,
    moon: 0.0,
    stars: 0.0,
  },
  {
    t: 450,
    top: h("#5f89c6"),
    bot: h("#ddad7e"),
    sun: 0.88,
    moon: 0.0,
    stars: 0.0,
  },
  {
    t: 540,
    top: h("#6ca9ec"),
    bot: h("#d8efff"),
    sun: 1.0,
    moon: 0.0,
    stars: 0.0,
  },
  {
    t: 720,
    top: h("#6ca9ec"),
    bot: h("#d8efff"),
    sun: 1.0,
    moon: 0.0,
    stars: 0.0,
  },
  {
    t: 900,
    top: h("#5e92d4"),
    bot: h("#f8ebd7"),
    sun: 0.95,
    moon: 0.0,
    stars: 0.0,
  },
  {
    t: 990,
    top: h("#5e92d4"),
    bot: h("#d7b083"),
    sun: 0.8,
    moon: 0.0,
    stars: 0.0,
  },
  {
    t: 1050,
    top: h("#4d6eaa"),
    bot: h("#efbfd0"),
    sun: 0.5,
    moon: 0.05,
    stars: 0.05,
  },
  {
    t: 1110,
    top: h("#6f72ba"),
    bot: h("#f08f5c"),
    sun: 0.08,
    moon: 0.25,
    stars: 0.15,
  },
  {
    t: 1170,
    top: h("#10182f"),
    bot: h("#58415f"),
    sun: 0.0,
    moon: 0.6,
    stars: 0.55,
  },
  {
    t: 1260,
    top: h("#081123"),
    bot: h("#403550"),
    sun: 0.0,
    moon: 0.85,
    stars: 0.9,
  },
  {
    t: 1440,
    top: h("#081123"),
    bot: h("#403550"),
    sun: 0.0,
    moon: 0.85,
    stars: 1.0,
  },
];

function sample(minute: number): SkyState {
  let lo: Keyframe = KEYS[0];
  let hi: Keyframe = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (minute >= KEYS[i].t && minute <= KEYS[i + 1].t) {
      lo = KEYS[i];
      hi = KEYS[i + 1];
      break;
    }
  }
  const e = smooth(hi.t === lo.t ? 0 : (minute - lo.t) / (hi.t - lo.t));
  return {
    top: lerpRGB(lo.top, hi.top, e),
    bot: lerpRGB(lo.bot, hi.bot, e),
    sun: lerp(lo.sun, hi.sun, e),
    moon: lerp(lo.moon, hi.moon, e),
    stars: lerp(lo.stars, hi.stars, e),
  };
}

// ─── Orbital arc ──────────────────────────────────────────────────────────────

function orbitalPos(
  minute: number,
  offsetMin: number,
  W: number,
  H: number,
): OrbitalPos {
  const norm = ((minute + offsetMin) % 1440) / 1440;
  const angle = norm * Math.PI * 2 - Math.PI / 2;
  return {
    x: W * 0.5 + W * 0.54 * Math.cos(angle),
    y: H * 1.05 + H * 1.32 * Math.sin(angle),
  };
}

// ─── Static particles (generated once per session) ────────────────────────────

const STARS: Star[] = Array.from({ length: 90 }, () => ({
  x: Math.random(),
  y: Math.random() * 0.72,
  r: 0.4 + Math.random() * 1.3,
  phase: Math.random() * Math.PI * 2,
  speed: 0.6 + Math.random() * 0.8,
}));

const DROPS: Drop[] = Array.from({ length: 220 }, () => ({
  x: Math.random(),
  y: Math.random(),
  len: 0.04 + Math.random() * 0.06,
  speed: 0.3 + Math.random() * 0.4,
  opacity: 0.28 + Math.random() * 0.36,
}));

const FLAKES: Flake[] = Array.from({ length: 120 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: 0.8 + Math.random() * 2.2,
  speed: 0.018 + Math.random() * 0.032,
  drift: Math.random() * Math.PI * 2,
  driftSpeed: 0.3 + Math.random() * 0.5,
}));

// ─── Weather decode ───────────────────────────────────────────────────────────
// WMO weather codes: https://open-meteo.com/en/docs#weathervariables

function decodeWeather(code: number, cloudCover: number): Weather {
  const clouds = cloudCover / 100;
  if (code === 0) return { type: "clear", clouds };
  if (code <= 2) return { type: "partly", clouds };
  if (code === 3) return { type: "overcast", clouds };
  if (code <= 49) return { type: "fog", clouds };
  if (code <= 67) return { type: "rain", clouds };
  if (code <= 77) return { type: "snow", clouds };
  if (code <= 82) return { type: "rain", clouds };
  if (code <= 86) return { type: "snow", clouds };
  if (code <= 99) return { type: "thunder", clouds };
  return { type: "clear", clouds };
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

function draw(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  minuteOfDay: number,
  wallMs: number,
  weather: Weather | null,
  flashRef: React.MutableRefObject<number>,
): void {
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }

  const s = sample(minuteOfDay);
  const sec = wallMs * 0.001;
  const clouds = weather ? clamp(weather.clouds, 0, 1) : 0;
  const wtype = weather ? weather.type : "clear";

  const cloudDim = 1 - clouds * 0.74;
  const cloudGrey = clouds * 0.58;
  const overTop: RGB = [88, 94, 106];
  const overBot: RGB = [138, 144, 152];

  // ── Sky gradient ──
  const skyTop = lerpRGB(s.top, overTop, cloudGrey);
  const skyBot = lerpRGB(s.bot, overBot, cloudGrey);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgb(skyTop));
  grad.addColorStop(1, rgb(skyBot));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Stars ──
  const starVis = s.stars * cloudDim;
  if (starVis > 0.005) {
    STARS.forEach((star) => {
      const twinkle = 0.55 + 0.45 * Math.sin(sec * star.speed + star.phase);
      ctx.globalAlpha = starVis * twinkle;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(star.x * W, star.y * H, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ── Moon ──
  const moonVis = s.moon * cloudDim;
  if (moonVis > 0.005) {
    const mp = orbitalPos(minuteOfDay, 720, W, H);
    if (mp.y < H + 40) {
      const mh = ctx.createRadialGradient(mp.x, mp.y, 14, mp.x, mp.y, 58);
      mh.addColorStop(0, rgb([200, 215, 255], moonVis * 0.22));
      mh.addColorStop(1, rgb([180, 196, 255], 0));
      ctx.fillStyle = mh;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 58, 0, Math.PI * 2);
      ctx.fill();

      const mg = ctx.createRadialGradient(
        mp.x - 5,
        mp.y - 5,
        2,
        mp.x,
        mp.y,
        20,
      );
      mg.addColorStop(0, rgb([255, 255, 252], moonVis));
      mg.addColorStop(0.55, rgb([224, 232, 255], moonVis * 0.9));
      mg.addColorStop(1, rgb([180, 196, 235], 0));
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Sun ──
  const sunVis = s.sun * cloudDim;
  if (sunVis > 0.005) {
    const sp = orbitalPos(minuteOfDay, 0, W, H);
    if (sp.y < H + 50) {
      const atmo = ctx.createRadialGradient(sp.x, sp.y, 22, sp.x, sp.y, 140);
      atmo.addColorStop(0, rgb([255, 195, 80], sunVis * 0.26));
      atmo.addColorStop(1, rgb([255, 140, 50], 0));
      ctx.fillStyle = atmo;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 140, 0, Math.PI * 2);
      ctx.fill();

      const corona = ctx.createRadialGradient(sp.x, sp.y, 10, sp.x, sp.y, 44);
      corona.addColorStop(0, rgb([244, 211, 94], sunVis * 0.95)); // --magnum-accent
      corona.addColorStop(1, rgb([255, 165, 70], 0));
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 44, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgb([255, 252, 238], sunVis);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Horizon glow at dawn / dusk ──
  const horizonBand = Math.max(0, 1 - Math.abs(s.sun - 0.32) * 3.5) * cloudDim;
  if (horizonBand > 0.01) {
    const hg = ctx.createLinearGradient(0, H * 0.38, 0, H);
    hg.addColorStop(0, rgb([255, 130, 60], 0));
    hg.addColorStop(0.4, rgb([255, 115, 48], horizonBand * 0.32));
    hg.addColorStop(1, rgb([244, 211, 94], 0));
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Cloud veil ──
  if (clouds > 0.05) {
    const d1 = Math.sin(sec * 0.038) * 0.08;
    const d2 = Math.cos(sec * 0.029) * 0.06;

    const cg1 = ctx.createRadialGradient(
      W * (0.28 + d1),
      H * 0.28,
      0,
      W * (0.28 + d1),
      H * 0.28,
      W * 0.46,
    );
    cg1.addColorStop(0, rgb([208, 214, 226], clouds * 0.56));
    cg1.addColorStop(1, rgb([200, 208, 220], 0));
    ctx.fillStyle = cg1;
    ctx.fillRect(0, 0, W, H);

    const cg2 = ctx.createRadialGradient(
      W * (0.7 + d2),
      H * 0.22,
      0,
      W * (0.7 + d2),
      H * 0.22,
      W * 0.42,
    );
    cg2.addColorStop(0, rgb([204, 210, 222], clouds * 0.46));
    cg2.addColorStop(1, rgb([196, 204, 216], 0));
    ctx.fillStyle = cg2;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Fog ──
  if (wtype === "fog") {
    const fg = ctx.createLinearGradient(0, H * 0.45, 0, H);
    fg.addColorStop(0, rgb([218, 223, 230], 0));
    fg.addColorStop(0.4, rgb([214, 220, 228], 0.52));
    fg.addColorStop(1, rgb([210, 216, 226], 0.82));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Rain ──
  if (wtype === "rain" || wtype === "thunder") {
    const windX = 0.07;
    ctx.save();
    ctx.strokeStyle = rgb([195, 215, 240]);
    ctx.lineWidth = 0.9;
    DROPS.forEach((d) => {
      const yy = ((d.y + sec * d.speed) % 1.0) * H;
      const xx = ((d.x + sec * windX) % 1.0) * W;
      ctx.globalAlpha = d.opacity;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + windX * d.len * H * 0.5, yy + d.len * H);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Snow ──
  if (wtype === "snow") {
    ctx.fillStyle = "#ffffff";
    FLAKES.forEach((f) => {
      const yy = ((f.y + sec * f.speed) % 1.0) * H;
      const xx =
        ((f.x + Math.sin(sec * f.driftSpeed + f.drift) * 0.016) % 1.0) * W;
      ctx.globalAlpha = 0.68;
      ctx.beginPath();
      ctx.arc(xx, yy, f.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ── Lightning flash ──
  if (wtype === "thunder") {
    if (flashRef.current > 0) {
      ctx.fillStyle = rgb([255, 255, 255], flashRef.current * 0.2);
      ctx.fillRect(0, 0, W, H);
      flashRef.current = Math.max(0, flashRef.current - 0.035);
    }
    if (Math.random() < 0.0003) flashRef.current = 1;
  }
}

// ─── Weather fetch ────────────────────────────────────────────────────────────

async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=weather_code,cloud_cover,precipitation,wind_speed_10m` +
    `&timezone=auto`;
  const res = await fetch(url);
  const data = await res.json();
  const cur = data.current as { weather_code: number; cloud_cover: number };
  return decodeWeather(cur.weather_code, cur.cloud_cover);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MagnumSkyBackgroundProps {
  className?: string;
}

export default function MagnumSkyBackground({
  className,
}: MagnumSkyBackgroundProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const weatherRef = useRef<Weather | null>(null);
  const flashRef = useRef<number>(0);
  const [status, setStatus] = useState<string | null>("");

  // Geolocation + weather, refresh every 10 min
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    function load(lat: number, lon: number): void {
      fetchWeather(lat, lon)
        .then((w) => {
          weatherRef.current = w;
          setStatus(null);
        })
        .catch(() => {
          weatherRef.current = { type: "clear", clouds: 0 };
          setStatus(null);
        });
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          setStatus("fetching weather…");
          load(lat, lon);
          interval = setInterval(() => load(lat, lon), 10 * 60 * 1000);
        },
        () => {
          weatherRef.current = { type: "clear", clouds: 0 };
          setStatus(null);
        },
        { timeout: 8000, maximumAge: 60000 },
      );
    } else {
      weatherRef.current = { type: "clear", clouds: 0 };
      setStatus(null);
    }

    return (): void => {
      clearInterval(interval);
    };
  }, []);

  // Render loop — synced to real local time
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;

    function tick(wallMs: number): void {
      const now = new Date();
      const mins =
        now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
      draw(canvas!, ctx!, mins, wallMs, weatherRef.current, flashRef);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return (): void => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      {status !== null && (
        <div
          style={{
            position: "fixed",
            bottom: 14,
            right: 18,
            fontSize: 11,
            color: "rgba(246,246,242,0.40)",
            letterSpacing: "0.04em",
            pointerEvents: "none",
            zIndex: 0,
            fontFamily: '"Avenir Next", system-ui, sans-serif',
          }}
        >
          {status}
        </div>
      )}
    </>
  );
}
