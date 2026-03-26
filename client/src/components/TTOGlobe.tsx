import { useEffect, useRef, useCallback } from "react";
import createGlobe from "cobe";

const TTO_MARKERS: Array<{ location: [number, number]; size: number }> = [
  // ── North America (US) ──
  { location: [42.36, -71.09], size: 0.07 }, // MIT
  { location: [37.43, -122.17], size: 0.07 }, // Stanford
  { location: [42.38, -71.12], size: 0.06 }, // Harvard
  { location: [37.76, -122.46], size: 0.06 }, // UCSF
  { location: [40.81, -73.96], size: 0.06 }, // Columbia
  { location: [39.33, -76.62], size: 0.05 }, // Johns Hopkins
  { location: [44.02, -92.47], size: 0.05 }, // Mayo Clinic
  { location: [39.95, -75.20], size: 0.05 }, // Penn
  { location: [41.32, -72.92], size: 0.05 }, // Yale
  { location: [35.99, -78.94], size: 0.05 }, // Duke
  { location: [38.65, -90.31], size: 0.05 }, // WUSTL
  { location: [42.06, -87.68], size: 0.05 }, // Northwestern
  { location: [34.14, -118.13], size: 0.05 }, // Caltech
  { location: [42.45, -76.48], size: 0.05 }, // Cornell
  { location: [36.14, -86.80], size: 0.04 }, // Vanderbilt
  { location: [42.28, -83.74], size: 0.05 }, // Michigan
  { location: [43.07, -89.40], size: 0.05 }, // Wisconsin
  { location: [30.28, -97.73], size: 0.05 }, // UT Austin
  { location: [32.88, -117.23], size: 0.05 }, // UC San Diego
  { location: [34.07, -118.44], size: 0.05 }, // UCLA
  { location: [37.87, -122.27], size: 0.06 }, // UC Berkeley
  { location: [40.44, -79.96], size: 0.05 }, // Pittsburgh
  { location: [33.79, -84.32], size: 0.05 }, // Emory
  { location: [47.66, -122.30], size: 0.05 }, // UW Seattle
  { location: [40.76, -111.84], size: 0.04 }, // Utah
  { location: [29.72, -95.34], size: 0.05 }, // Houston
  { location: [44.97, -93.23], size: 0.05 }, // Minnesota
  { location: [45.50, -122.69], size: 0.04 }, // OHSU
  { location: [40.79, -73.95], size: 0.04 }, // Mt Sinai
  { location: [40.76, -73.96], size: 0.04 }, // Sloan Kettering
  { location: [29.71, -95.40], size: 0.05 }, // MD Anderson
  { location: [38.91, -77.07], size: 0.04 }, // Georgetown
  { location: [29.65, -82.35], size: 0.04 }, // Florida
  { location: [35.90, -79.05], size: 0.04 }, // UNC
  { location: [41.83, -71.40], size: 0.04 }, // Brown

  // ── Canada ──
  { location: [43.66, -79.40], size: 0.05 }, // University of Toronto
  { location: [49.27, -123.22], size: 0.05 }, // UBC Vancouver
  { location: [45.42, -75.68], size: 0.04 }, // Ottawa
  { location: [45.50, -73.58], size: 0.04 }, // McGill Montreal
  { location: [51.08, -114.13], size: 0.04 }, // Calgary
  { location: [53.52, -113.53], size: 0.04 }, // Alberta Edmonton

  // ── UK ──
  { location: [51.75, -1.25], size: 0.06 },  // Oxford
  { location: [52.21, 0.12], size: 0.06 },   // Cambridge
  { location: [51.50, -0.17], size: 0.05 },  // Imperial College London
  { location: [51.52, -0.13], size: 0.05 },  // UCL London
  { location: [55.95, -3.19], size: 0.04 },  // Edinburgh
  { location: [53.47, -2.23], size: 0.04 },  // Manchester
  { location: [51.45, -2.60], size: 0.04 },  // Bristol
  { location: [53.38, -1.49], size: 0.04 },  // Sheffield

  // ── Western Europe ──
  { location: [47.38, 8.55], size: 0.06 },   // ETH Zurich
  { location: [46.52, 6.57], size: 0.05 },   // EPFL Lausanne
  { location: [48.15, 11.57], size: 0.05 },  // TU Munich
  { location: [49.41, 8.71], size: 0.04 },   // Heidelberg
  { location: [50.88, 4.70], size: 0.05 },   // KU Leuven
  { location: [48.85, 2.35], size: 0.05 },   // Paris Sorbonne / Pasteur
  { location: [52.37, 4.90], size: 0.04 },   // Amsterdam
  { location: [59.35, 18.07], size: 0.04 },  // Karolinska Stockholm
  { location: [59.91, 10.74], size: 0.04 },  // Oslo
  { location: [60.19, 24.83], size: 0.04 },  // Helsinki
  { location: [55.70, 12.56], size: 0.04 },  // Copenhagen DTU
  { location: [53.35, -6.26], size: 0.04 },  // Trinity College Dublin
  { location: [41.39, 2.15], size: 0.04 },   // Barcelona (CRG/IRB)
  { location: [40.41, -3.68], size: 0.04 },  // Madrid (CSIC)
  { location: [52.52, 13.40], size: 0.04 },  // Berlin Charité

  // ── Israel ──
  { location: [32.07, 34.82], size: 0.05 },  // Tel Aviv / Yissum
  { location: [31.90, 34.80], size: 0.05 },  // Weizmann Institute
  { location: [32.77, 35.02], size: 0.04 },  // Technion Haifa

  // ── Asia-Pacific ──
  { location: [35.69, 139.69], size: 0.05 }, // University of Tokyo
  { location: [35.03, 135.78], size: 0.05 }, // Kyoto
  { location: [34.82, 135.52], size: 0.04 }, // Osaka
  { location: [37.59, 127.02], size: 0.05 }, // Seoul National
  { location: [36.37, 127.36], size: 0.04 }, // KAIST Daejeon
  { location: [39.99, 116.31], size: 0.05 }, // Peking University
  { location: [40.00, 116.33], size: 0.05 }, // Tsinghua Beijing
  { location: [31.02, 121.44], size: 0.05 }, // Fudan / Shanghai
  { location: [1.30, 103.78], size: 0.05 },  // NUS Singapore
  { location: [1.35, 103.68], size: 0.04 },  // Nanyang NTU
  { location: [22.28, 114.18], size: 0.04 }, // HKU Hong Kong
  { location: [19.08, 72.88], size: 0.04 },  // IIT Bombay
  { location: [12.91, 77.57], size: 0.04 },  // IISc Bangalore
  { location: [28.54, 77.19], size: 0.04 },  // IIT Delhi

  // ── Australia ──
  { location: [-37.80, 144.96], size: 0.05 }, // Melbourne
  { location: [-33.89, 151.19], size: 0.05 }, // Sydney
  { location: [-27.50, 153.01], size: 0.04 }, // Queensland

  // ── Middle East / Africa ──
  { location: [24.47, 54.37], size: 0.04 },  // UAE Abu Dhabi (NYU Abu Dhabi / Masdar)
  { location: [25.28, 51.49], size: 0.04 },  // Qatar (Weill Cornell)
  { location: [-25.74, 28.24], size: 0.04 }, // Pretoria (UP / CSIR)
];

const ARC_PAIRS: Array<[[number, number], [number, number]]> = [
  // US internal
  [[42.36, -71.09], [37.43, -122.17]],   // MIT → Stanford
  [[42.38, -71.12], [40.81, -73.96]],    // Harvard → Columbia
  [[39.33, -76.62], [35.99, -78.94]],    // Hopkins → Duke
  [[37.76, -122.46], [34.07, -118.44]],  // UCSF → UCLA
  [[44.97, -93.23], [42.28, -83.74]],    // Minnesota → Michigan
  [[29.72, -95.34], [40.76, -73.96]],    // Houston → Sloan Kettering
  [[47.66, -122.30], [37.87, -122.27]],  // UW → Berkeley
  [[30.28, -97.73], [38.65, -90.31]],    // Austin → WUSTL
  [[45.50, -122.69], [32.88, -117.23]],  // OHSU → UCSD

  // US ↔ Canada
  [[42.36, -71.09], [43.66, -79.40]],    // MIT → Toronto
  [[37.43, -122.17], [49.27, -123.22]],  // Stanford → UBC
  [[40.81, -73.96], [45.50, -73.58]],    // Columbia → McGill

  // US ↔ UK
  [[42.36, -71.09], [51.75, -1.25]],     // MIT → Oxford
  [[42.38, -71.12], [52.21, 0.12]],      // Harvard → Cambridge
  [[40.81, -73.96], [51.50, -0.17]],     // Columbia → Imperial
  [[39.33, -76.62], [51.52, -0.13]],     // Hopkins → UCL
  [[37.43, -122.17], [55.95, -3.19]],    // Stanford → Edinburgh

  // US ↔ Europe
  [[42.36, -71.09], [47.38, 8.55]],      // MIT → ETH Zurich
  [[40.81, -73.96], [48.85, 2.35]],      // Columbia → Paris
  [[37.43, -122.17], [50.88, 4.70]],     // Stanford → KU Leuven
  [[39.95, -75.20], [49.41, 8.71]],      // Penn → Heidelberg
  [[36.14, -86.80], [48.15, 11.57]],     // Vanderbilt → TU Munich
  [[29.71, -95.40], [59.35, 18.07]],     // MD Anderson → Karolinska

  // US ↔ Israel
  [[42.36, -71.09], [31.90, 34.80]],     // MIT → Weizmann
  [[40.81, -73.96], [32.07, 34.82]],     // Columbia → Tel Aviv

  // US ↔ Asia
  [[37.43, -122.17], [35.69, 139.69]],   // Stanford → Tokyo
  [[37.43, -122.17], [1.30, 103.78]],    // Stanford → NUS
  [[47.66, -122.30], [37.59, 127.02]],   // UW → Seoul
  [[37.87, -122.27], [39.99, 116.31]],   // Berkeley → Peking
  [[34.07, -118.44], [31.02, 121.44]],   // UCLA → Shanghai

  // US ↔ Australia
  [[37.43, -122.17], [-37.80, 144.96]],  // Stanford → Melbourne
  [[29.71, -95.40], [-33.89, 151.19]],   // MD Anderson → Sydney

  // Europe internal
  [[51.75, -1.25], [47.38, 8.55]],       // Oxford → ETH Zurich
  [[52.21, 0.12], [50.88, 4.70]],        // Cambridge → KU Leuven
  [[51.50, -0.17], [48.15, 11.57]],      // Imperial → TU Munich
  [[59.35, 18.07], [47.38, 8.55]],       // Karolinska → ETH
  [[55.95, -3.19], [55.70, 12.56]],      // Edinburgh → DTU

  // Europe ↔ Israel
  [[51.75, -1.25], [31.90, 34.80]],      // Oxford → Weizmann
  [[47.38, 8.55], [32.77, 35.02]],       // ETH → Technion

  // Europe ↔ Asia
  [[51.50, -0.17], [35.69, 139.69]],     // Imperial → Tokyo
  [[48.85, 2.35], [1.30, 103.78]],       // Paris → NUS
  [[47.38, 8.55], [19.08, 72.88]],       // ETH → IIT Bombay

  // Asia internal / Aus
  [[35.69, 139.69], [1.30, 103.78]],     // Tokyo → NUS
  [[37.59, 127.02], [39.99, 116.31]],    // Seoul → Beijing
  [[31.02, 121.44], [-33.89, 151.19]],   // Shanghai → Sydney
  [[-37.80, 144.96], [1.30, 103.78]],    // Melbourne → Singapore

  // Middle East connections
  [[31.90, 34.80], [51.50, -0.17]],      // Weizmann → Imperial
  [[32.07, 34.82], [47.38, 8.55]],       // Tel Aviv → ETH
  [[25.28, 51.49], [1.30, 103.78]],      // Qatar → Singapore
];

interface ArcState {
  idx: number;
  alpha: number;
  phase: "in" | "hold" | "out";
  holdFrames: number;
}

const FADE_IN_SPEED = 0.012;
const FADE_OUT_SPEED = 0.010;
const HOLD_FRAMES = 200;
const MAX_ACTIVE_ARCS = 5;
const EMERALD: [number, number, number] = [0.24, 0.9, 0.52];

interface TTOGlobeProps {
  size?: number;
  isDark?: boolean;
  className?: string;
}

export function TTOGlobe({ size = 280, isDark = true, className = "" }: TTOGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0.4);
  const arcStatesRef = useRef<ArcState[]>([]);

  const pickFreshIdx = useCallback((usedIndices: number[]): number => {
    const available = ARC_PAIRS.map((_, i) => i).filter((i) => !usedIndices.includes(i));
    if (available.length === 0) return Math.floor(Math.random() * ARC_PAIRS.length);
    return available[Math.floor(Math.random() * available.length)];
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    arcStatesRef.current = [0, 10, 22, 33, 42].map((idx) => ({
      idx,
      alpha: 0,
      phase: "in" as const,
      holdFrames: 0,
    }));

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi: phiRef.current,
      theta: 0.15,
      dark: isDark ? 1 : 0,
      diffuse: 1.4,
      mapSamples: 16000,
      mapBrightness: isDark ? 5 : 3,
      mapBaseBrightness: isDark ? 0 : 0.1,
      baseColor: isDark ? [0.04, 0.12, 0.08] : [0.86, 0.93, 0.88],
      markerColor: EMERALD,
      glowColor: isDark ? [0.14, 0.68, 0.38] : [0.12, 0.55, 0.30],
      markers: TTO_MARKERS,
      arcs: [],
      arcColor: EMERALD,
      arcWidth: 2,
      arcHeight: 0.38,
    });

    let rafId: number;

    const animate = () => {
      phiRef.current += 0.003;

      const states = arcStatesRef.current.map((arc) => {
        let { idx, alpha, phase, holdFrames } = arc;

        if (phase === "in") {
          alpha = Math.min(1, alpha + FADE_IN_SPEED);
          if (alpha >= 1) { alpha = 1; phase = "hold"; holdFrames = 0; }
        } else if (phase === "hold") {
          holdFrames += 1;
          if (holdFrames >= HOLD_FRAMES) { phase = "out"; }
        } else {
          alpha = Math.max(0, alpha - FADE_OUT_SPEED);
          if (alpha <= 0) {
            const usedIdxs = arcStatesRef.current.map((a) => a.idx);
            idx = pickFreshIdx(usedIdxs);
            alpha = 0;
            phase = "in";
            holdFrames = 0;
          }
        }

        return { idx, alpha, phase, holdFrames } as ArcState;
      });

      arcStatesRef.current = states;

      const computedArcs = states.map(({ idx, alpha }) => ({
        from: ARC_PAIRS[idx][0],
        to: ARC_PAIRS[idx][1],
        color: [EMERALD[0] * alpha, EMERALD[1] * alpha, EMERALD[2] * alpha] as [number, number, number],
      }));

      globe.update({ phi: phiRef.current, arcs: computedArcs });
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      globe.destroy();
    };
  }, [size, isDark, pickFreshIdx]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}
