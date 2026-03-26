import { useId, useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";

const W = 800;
const H = 400;

function project(lat: number, lng: number): [number, number] {
  return [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];
}

function arcPath(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): string {
  const [x1, y1] = project(lat1, lng1);
  const [x2, y2] = project(lat2, lng2);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curve = Math.min(dist * 0.35, 80);
  const nx = -dy / dist;
  const ny = dx / dist;
  const cx = mx + nx * curve;
  const cy = my + ny * curve;
  return `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
}

const ARC_PAIRS: [[number, number], [number, number]][] = [
  [[42.36, -71.09], [37.43, -122.17]],
  [[42.38, -71.12], [40.81, -73.96]],
  [[39.33, -76.62], [35.99, -78.94]],
  [[37.76, -122.46], [34.07, -118.44]],
  [[44.97, -93.23], [42.28, -83.74]],
  [[29.72, -95.34], [40.76, -73.96]],
  [[47.66, -122.30], [37.87, -122.27]],
  [[42.36, -71.09], [43.66, -79.40]],
  [[37.43, -122.17], [49.27, -123.22]],
  [[40.81, -73.96], [45.50, -73.58]],
  [[42.36, -71.09], [51.75, -1.25]],
  [[42.38, -71.12], [52.21, 0.12]],
  [[40.81, -73.96], [51.50, -0.17]],
  [[39.33, -76.62], [51.52, -0.13]],
  [[37.43, -122.17], [55.95, -3.19]],
  [[42.36, -71.09], [47.38, 8.55]],
  [[40.81, -73.96], [48.85, 2.35]],
  [[37.43, -122.17], [50.88, 4.70]],
  [[36.14, -86.80], [48.15, 11.57]],
  [[29.71, -95.40], [59.35, 18.07]],
  [[42.36, -71.09], [31.90, 34.80]],
  [[40.81, -73.96], [32.07, 34.82]],
  [[37.43, -122.17], [35.69, 139.69]],
  [[37.43, -122.17], [1.30, 103.78]],
  [[47.66, -122.30], [37.59, 127.02]],
  [[37.87, -122.27], [39.99, 116.31]],
  [[34.07, -118.44], [31.02, 121.44]],
  [[37.43, -122.17], [-37.80, 144.96]],
  [[29.71, -95.40], [-33.89, 151.19]],
  [[51.75, -1.25], [47.38, 8.55]],
  [[52.21, 0.12], [50.88, 4.70]],
  [[51.50, -0.17], [48.15, 11.57]],
  [[59.35, 18.07], [47.38, 8.55]],
  [[51.75, -1.25], [31.90, 34.80]],
  [[47.38, 8.55], [32.77, 35.02]],
  [[51.50, -0.17], [35.69, 139.69]],
  [[48.85, 2.35], [1.30, 103.78]],
  [[47.38, 8.55], [19.08, 72.88]],
  [[35.69, 139.69], [1.30, 103.78]],
  [[37.59, 127.02], [39.99, 116.31]],
  [[31.02, 121.44], [-33.89, 151.19]],
  [[-37.80, 144.96], [1.30, 103.78]],
  [[31.90, 34.80], [51.50, -0.17]],
  [[32.07, 34.82], [47.38, 8.55]],
  [[25.28, 51.49], [1.30, 103.78]],
];

const TTO_DOTS: [number, number][] = [
  [42.36, -71.09], [37.43, -122.17], [42.38, -71.12], [37.76, -122.46],
  [40.81, -73.96], [39.33, -76.62], [44.02, -92.47], [39.95, -75.20],
  [41.32, -72.92], [35.99, -78.94], [38.65, -90.31], [42.06, -87.68],
  [34.14, -118.13], [42.45, -76.48], [36.14, -86.80], [42.28, -83.74],
  [43.07, -89.40], [30.28, -97.73], [32.88, -117.23], [34.07, -118.44],
  [37.87, -122.27], [40.44, -79.96], [33.79, -84.32], [47.66, -122.30],
  [40.76, -111.84], [29.72, -95.34], [44.97, -93.23], [45.50, -122.69],
  [40.79, -73.95], [40.76, -73.96], [29.71, -95.40], [38.91, -77.07],
  [29.65, -82.35], [35.90, -79.05], [41.83, -71.40],
  [43.66, -79.40], [49.27, -123.22], [45.42, -75.68], [45.50, -73.58], [51.08, -114.13], [53.52, -113.53],
  [51.75, -1.25], [52.21, 0.12], [51.50, -0.17], [51.52, -0.13], [55.95, -3.19], [53.47, -2.23],
  [47.38, 8.55], [46.52, 6.57], [48.15, 11.57], [49.41, 8.71], [50.88, 4.70],
  [48.85, 2.35], [52.37, 4.90], [59.35, 18.07], [59.91, 10.74], [60.19, 24.83],
  [55.70, 12.56], [53.35, -6.26], [41.39, 2.15], [40.41, -3.68], [52.52, 13.40],
  [32.07, 34.82], [31.90, 34.80], [32.77, 35.02],
  [35.69, 139.69], [35.03, 135.78], [37.59, 127.02], [39.99, 116.31], [40.00, 116.33],
  [31.02, 121.44], [1.30, 103.78], [22.28, 114.18], [19.08, 72.88], [12.91, 77.57],
  [-37.80, 144.96], [-33.89, 151.19], [-27.50, 153.01],
  [24.47, 54.37], [25.28, 51.49],
];

const ACTIVE_COUNT = 6;
const CYCLE_MS = 6000;

function getRandomSubset(arr: number[], count: number): number[] {
  const result: number[] = [];
  const available = [...arr];
  while (result.length < count && available.length > 0) {
    const i = Math.floor(Math.random() * available.length);
    result.push(available.splice(i, 1)[0]);
  }
  return result;
}

const CONTINENT_PATHS = [
  // North America (simplified)
  "M 33,108 Q 55,75 67,53 Q 92,58 119,79 Q 147,111 152,118 Q 158,132 162,148 Q 167,165 170,182 Q 180,208 204,218 Q 235,228 278,228 L 284,214 Q 280,195 278,180 Q 274,164 260,168 Q 244,173 231,179 Q 214,196 210,205 Q 225,193 254,170 Q 270,160 280,156 Q 294,150 314,129 Q 330,118 353,120 Q 349,95 322,76 Q 308,57 285,48 Q 308,38 320,42 Q 332,33 310,35 Q 285,47 278,60 Q 266,62 252,65 Q 234,65 218,68 Q 200,72 182,80 Q 164,90 148,103 Q 140,110 140,130 Q 120,130 100,125 Q 72,118 50,108 Z",
  // South America (simplified)
  "M 278,228 L 288,228 Q 320,218 340,220 Q 378,258 395,275 Q 402,290 400,312 Q 395,338 375,368 Q 355,395 330,407 Q 315,405 298,390 Q 281,368 272,338 Q 264,305 266,280 Q 268,258 275,242 Z",
  // Europe (simplified)
  "M 475,148 Q 488,132 490,125 Q 494,113 500,108 Q 508,110 514,103 Q 525,93 528,91 Q 528,88 515,79 Q 530,68 555,60 Q 568,55 577,53 Q 582,56 580,60 Q 575,70 567,78 Q 567,89 553,100 Q 540,102 532,100 Q 534,115 525,127 Q 519,131 515,130 Q 511,127 505,127 Q 504,136 511,148 Q 520,156 530,164 Q 542,162 548,155 Q 556,148 561,147 Q 571,148 575,147 Q 583,134 596,133 Q 608,133 614,136 Q 614,148 605,155 Q 595,162 580,164 Q 565,164 550,170 Q 530,172 510,165 Q 492,158 475,148 Z",
  // Africa (simplified)
  "M 450,150 Q 475,148 490,148 Q 512,150 532,155 Q 555,158 580,165 Q 598,175 610,185 Q 630,195 641,217 Q 645,235 640,255 Q 632,275 620,295 Q 605,318 590,338 Q 570,358 550,370 Q 535,378 520,380 Q 502,376 485,360 Q 468,340 455,315 Q 442,285 440,258 Q 435,232 440,208 Q 445,185 448,168 Z",
  // Asia (simplified)
  "M 580,165 Q 600,158 614,136 Q 620,128 632,128 Q 645,125 655,122 Q 670,118 688,110 Q 705,98 715,90 Q 730,82 750,75 Q 768,68 785,62 Q 800,58 815,58 Q 830,58 845,62 Q 858,66 866,73 Q 874,80 878,90 Q 882,100 882,110 Q 880,125 875,138 Q 868,152 860,165 Q 848,178 836,190 Q 820,200 808,212 Q 792,225 780,238 Q 765,252 750,262 Q 734,272 720,278 Q 702,284 688,280 Q 672,272 660,260 Q 646,248 635,238 Q 622,227 612,218 Q 600,208 590,200 Q 580,192 576,180 Z",
  // India sub-peninsula
  "M 642,220 Q 652,235 655,255 Q 656,275 648,295 Q 636,312 622,318 Q 610,318 600,306 Q 592,292 592,272 Q 594,250 604,235 Q 616,222 630,218 Z",
  // Southeast Asia + Malay peninsula
  "M 720,278 Q 735,290 742,305 Q 744,320 738,335 Q 730,345 720,345 Q 710,345 703,335 Q 696,322 698,308 Q 702,294 712,284 Z",
  // Australia (simplified)
  "M 790,285 Q 810,278 832,278 Q 855,278 872,285 Q 888,295 895,312 Q 900,328 898,345 Q 895,362 886,375 Q 874,388 858,395 Q 840,400 822,398 Q 803,395 788,384 Q 772,370 765,352 Q 758,333 762,315 Q 767,298 780,288 Z",
  // Greenland
  "M 344,19 Q 378,15 410,20 Q 435,28 448,42 Q 450,55 435,68 Q 415,80 392,82 Q 372,82 355,72 Q 340,60 338,44 Z",
  // UK (simplified blob)
  "M 499,108 Q 505,100 510,108 Q 508,118 500,122 Q 494,118 499,108 Z",
  // Japan (simplified)
  "M 882,118 Q 892,110 900,115 Q 905,125 900,135 Q 892,142 883,138 Q 876,130 882,118 Z",
  // Korean peninsula
  "M 865,135 Q 873,128 878,135 Q 878,148 869,152 Q 862,148 865,135 Z",
  // New Zealand (tiny)
  "M 928,355 Q 935,348 940,355 Q 940,365 932,368 Q 926,365 928,355 Z",
];

interface WorldMapProps {
  width?: number;
  height?: number;
  isDark?: boolean;
  className?: string;
}

export function WorldMap({
  width = 480,
  height = 240,
  isDark = true,
  className = "",
}: WorldMapProps) {
  const clipId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: false, amount: 0.3 });

  const landColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
  const landStroke = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
  const dotColor = isDark ? "hsl(142 65% 60%)" : "hsl(142 52% 36%)";
  const arcColor = isDark ? "hsl(142 65% 55%)" : "hsl(142 52% 36%)";
  const arcOpacity = isDark ? 0.60 : 0.50;
  const gridColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  const activeArcs = useMemo(() => {
    const allIndices = ARC_PAIRS.map((_, i) => i);
    return getRandomSubset(allIndices, ACTIVE_COUNT);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width, height, position: "relative", overflow: "hidden" }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={width}
        height={height}
        style={{ display: "block" }}
        aria-hidden
      >
        <defs>
          <clipPath id={`wm-clip-${clipId}`}>
            <rect x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>

        <g clipPath={`url(#wm-clip-${clipId})`}>
          {/* Graticule */}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = ((90 - lat) / 180) * H;
            return (
              <line
                key={`lat-${lat}`}
                x1={0} y1={y} x2={W} y2={y}
                stroke={gridColor}
                strokeWidth={lat === 0 ? 1.2 : 0.8}
              />
            );
          })}
          {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => {
            const x = ((lng + 180) / 360) * W;
            return (
              <line
                key={`lng-${lng}`}
                x1={x} y1={0} x2={x} y2={H}
                stroke={gridColor}
                strokeWidth={0.8}
              />
            );
          })}

          {/* Continent fills */}
          {CONTINENT_PATHS.map((d, i) => (
            <path
              key={i}
              d={d}
              fill={landColor}
              stroke={landStroke}
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          ))}

          {/* TTO dots */}
          {TTO_DOTS.map(([lat, lng], i) => {
            const [x, y] = project(lat, lng);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={2.2}
                fill={dotColor}
                opacity={0.65}
              />
            );
          })}

          {/* Animated arcs */}
          {inView &&
            activeArcs.map((arcIdx, i) => {
              const [[lat1, lng1], [lat2, lng2]] = ARC_PAIRS[arcIdx];
              const d = arcPath(lat1, lng1, lat2, lng2);
              const delay = (i / ACTIVE_COUNT) * CYCLE_MS * 0.001;
              const dur = CYCLE_MS / 1000;

              return (
                <g key={`arc-${arcIdx}-${i}`}>
                  <motion.path
                    d={d}
                    fill="none"
                    stroke={arcColor}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: [0, 1, 1, 0], opacity: [0, arcOpacity, arcOpacity, 0] }}
                    transition={{
                      pathLength: {
                        duration: dur,
                        delay,
                        repeat: Infinity,
                        repeatDelay: 0.8,
                        ease: "easeInOut",
                      },
                      opacity: {
                        duration: dur,
                        delay,
                        repeat: Infinity,
                        repeatDelay: 0.8,
                        ease: "easeInOut",
                        times: [0, 0.15, 0.85, 1],
                      },
                    }}
                  />
                  <motion.circle
                    r={3}
                    fill={arcColor}
                    opacity={0}
                    initial={{ opacity: 0 }}
                  >
                    <animateMotion
                      path={d}
                      dur={`${dur}s`}
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                      calcMode="spline"
                      keySplines="0.4 0 0.6 1"
                    />
                    <animate
                      attributeName="opacity"
                      values={`0;${arcOpacity};${arcOpacity};0`}
                      keyTimes="0;0.15;0.85;1"
                      dur={`${dur}s`}
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                    />
                  </motion.circle>
                </g>
              );
            })}
        </g>
      </svg>
    </div>
  );
}
