import { useEffect, useRef, useCallback } from "react";
import createGlobe from "cobe";

const TTO_MARKERS: Array<{ location: [number, number]; size: number }> = [
  { location: [42.36, -71.09], size: 0.07 },
  { location: [37.43, -122.17], size: 0.07 },
  { location: [42.38, -71.12], size: 0.06 },
  { location: [37.76, -122.46], size: 0.06 },
  { location: [40.81, -73.96], size: 0.06 },
  { location: [39.33, -76.62], size: 0.05 },
  { location: [44.02, -92.47], size: 0.05 },
  { location: [39.95, -75.20], size: 0.05 },
  { location: [41.32, -72.92], size: 0.05 },
  { location: [35.99, -78.94], size: 0.05 },
  { location: [38.65, -90.31], size: 0.05 },
  { location: [42.06, -87.68], size: 0.05 },
  { location: [34.14, -118.13], size: 0.05 },
  { location: [42.45, -76.48], size: 0.05 },
  { location: [40.73, -74.00], size: 0.05 },
  { location: [36.14, -86.80], size: 0.04 },
  { location: [42.28, -83.74], size: 0.05 },
  { location: [43.07, -89.40], size: 0.05 },
  { location: [30.28, -97.73], size: 0.05 },
  { location: [32.88, -117.23], size: 0.05 },
  { location: [34.07, -118.44], size: 0.05 },
  { location: [37.87, -122.27], size: 0.06 },
  { location: [40.44, -79.96], size: 0.05 },
  { location: [33.79, -84.32], size: 0.05 },
  { location: [42.35, -71.11], size: 0.05 },
  { location: [39.96, -83.00], size: 0.04 },
  { location: [40.80, -77.86], size: 0.04 },
  { location: [40.42, -86.92], size: 0.04 },
  { location: [33.78, -84.40], size: 0.04 },
  { location: [47.66, -122.30], size: 0.05 },
  { location: [38.54, -121.76], size: 0.04 },
  { location: [33.64, -117.84], size: 0.04 },
  { location: [43.13, -77.63], size: 0.04 },
  { location: [38.03, -78.51], size: 0.04 },
  { location: [35.90, -79.05], size: 0.04 },
  { location: [40.01, -105.27], size: 0.04 },
  { location: [40.76, -111.84], size: 0.04 },
  { location: [32.23, -110.95], size: 0.04 },
  { location: [41.50, -81.61], size: 0.04 },
  { location: [42.41, -71.12], size: 0.04 },
  { location: [43.70, -72.29], size: 0.04 },
  { location: [41.83, -71.40], size: 0.04 },
  { location: [29.72, -95.34], size: 0.05 },
  { location: [30.62, -96.34], size: 0.04 },
  { location: [40.82, -96.70], size: 0.04 },
  { location: [41.66, -91.53], size: 0.04 },
  { location: [44.97, -93.23], size: 0.05 },
  { location: [39.18, -86.51], size: 0.04 },
  { location: [38.95, -92.33], size: 0.04 },
  { location: [45.50, -122.69], size: 0.04 },
  { location: [40.79, -73.95], size: 0.04 },
  { location: [40.76, -73.96], size: 0.04 },
  { location: [29.71, -95.40], size: 0.05 },
  { location: [36.13, -80.27], size: 0.04 },
  { location: [38.91, -77.07], size: 0.04 },
  { location: [29.65, -82.35], size: 0.04 },
  { location: [43.66, -79.40], size: 0.04 },
  { location: [49.27, -123.22], size: 0.04 },
  { location: [51.75, -1.25], size: 0.04 },
  { location: [52.21, 0.12], size: 0.04 },
  { location: [47.38, 8.55], size: 0.04 },
  { location: [1.30, 103.78], size: 0.04 },
  { location: [35.69, 139.69], size: 0.04 },
  { location: [32.07, 34.82], size: 0.04 },
];

const ARC_PAIRS: Array<[[number, number], [number, number]]> = [
  [[42.36, -71.09], [37.43, -122.17]],
  [[42.36, -71.09], [51.75, -1.25]],
  [[37.43, -122.17], [35.69, 139.69]],
  [[37.43, -122.17], [1.30, 103.78]],
  [[40.81, -73.96], [52.21, 0.12]],
  [[40.81, -73.96], [47.38, 8.55]],
  [[37.76, -122.46], [49.27, -123.22]],
  [[42.36, -71.09], [40.81, -73.96]],
  [[39.33, -76.62], [51.75, -1.25]],
  [[29.72, -95.34], [43.66, -79.40]],
  [[47.66, -122.30], [35.69, 139.69]],
  [[44.97, -93.23], [37.43, -122.17]],
  [[35.99, -78.94], [42.38, -71.12]],
  [[34.07, -118.44], [32.07, 34.82]],
  [[40.76, -111.84], [37.43, -122.17]],
  [[38.65, -90.31], [42.36, -71.09]],
  [[33.79, -84.32], [40.81, -73.96]],
  [[40.44, -79.96], [42.36, -71.09]],
  [[38.54, -121.76], [37.43, -122.17]],
  [[42.38, -71.12], [40.81, -73.96]],
];

interface TTOGlobeProps {
  size?: number;
  isDark?: boolean;
  className?: string;
}

export function TTOGlobe({ size = 280, isDark = true, className = "" }: TTOGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0.4);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const arcTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeArcIdxRef = useRef<number[]>([0, 4, 8, 13]);

  const getActiveArcs = useCallback((indices: number[]) =>
    indices.map((i) => ({
      from: ARC_PAIRS[i][0],
      to: ARC_PAIRS[i][1],
      color: [0.24, 0.9, 0.52] as [number, number, number],
    }))
  , []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi: phiRef.current,
      theta: 0.18,
      dark: isDark ? 1 : 0,
      diffuse: 1.4,
      mapSamples: 16000,
      mapBrightness: isDark ? 5 : 3,
      mapBaseBrightness: isDark ? 0 : 0.1,
      baseColor: isDark ? [0.04, 0.12, 0.08] : [0.86, 0.93, 0.88],
      markerColor: [0.24, 0.9, 0.52],
      glowColor: isDark ? [0.14, 0.68, 0.38] : [0.12, 0.55, 0.30],
      markers: TTO_MARKERS,
      arcs: getActiveArcs(activeArcIdxRef.current),
      arcColor: [0.24, 0.9, 0.52],
      arcWidth: 2,
      arcHeight: 0.35,
    });

    globeRef.current = globe;

    let rafId: number;
    const animate = () => {
      phiRef.current += 0.003;
      globe.update({ phi: phiRef.current });
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    arcTimerRef.current = setInterval(() => {
      const current = [...activeArcIdxRef.current];
      const swapIdx = Math.floor(Math.random() * current.length);
      let next = Math.floor(Math.random() * ARC_PAIRS.length);
      while (current.includes(next)) {
        next = Math.floor(Math.random() * ARC_PAIRS.length);
      }
      current[swapIdx] = next;
      activeArcIdxRef.current = current;
      globe.update({ arcs: getActiveArcs(current) });
    }, 3000);

    return () => {
      cancelAnimationFrame(rafId);
      globe.destroy();
      globeRef.current = null;
      if (arcTimerRef.current) {
        clearInterval(arcTimerRef.current);
        arcTimerRef.current = null;
      }
    };
  }, [size, isDark, getActiveArcs]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}
