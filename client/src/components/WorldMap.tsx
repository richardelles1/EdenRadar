import { useId, useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";

const W = 1000;
const H = 500;

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
  const curve = Math.min(dist * 0.38, 95);
  const nx = -dy / dist;
  const ny = dx / dist;
  const cx = mx + nx * curve;
  const cy = my + ny * curve;
  return `M ${x1.toFixed(1)},${y1.toFixed(1)} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

const ARC_PAIRS: [[number, number], [number, number]][] = [
  // US internal
  [[42.36, -71.09], [37.43, -122.17]],   // MIT → Stanford
  [[42.38, -71.12], [40.81, -73.96]],    // Harvard → Columbia
  [[37.76, -122.46], [34.07, -118.44]],  // UCSF → UCLA
  // US ↔ Canada
  [[42.36, -71.09], [43.66, -79.40]],    // MIT → Toronto
  [[37.43, -122.17], [49.27, -123.22]],  // Stanford → UBC
  // US ↔ UK
  [[42.36, -71.09], [51.75, -1.25]],     // MIT → Oxford
  [[42.38, -71.12], [52.21, 0.12]],      // Harvard → Cambridge
  [[40.81, -73.96], [51.50, -0.17]],     // Columbia → Imperial
  [[39.33, -76.62], [51.52, -0.13]],     // Hopkins → UCL
  // US ↔ Europe
  [[42.36, -71.09], [47.38, 8.55]],      // MIT → ETH Zurich
  [[40.81, -73.96], [48.85, 2.35]],      // Columbia → Paris
  [[29.71, -95.40], [59.35, 18.07]],     // MD Anderson → Karolinska
  // US ↔ Israel
  [[42.36, -71.09], [31.90, 34.80]],     // MIT → Weizmann
  // US ↔ Asia
  [[37.43, -122.17], [35.69, 139.69]],   // Stanford → Tokyo
  [[37.43, -122.17], [1.30, 103.78]],    // Stanford → NUS
  [[47.66, -122.30], [37.59, 127.02]],   // UW → Seoul
  // US ↔ Australia
  [[37.43, -122.17], [-37.80, 144.96]],  // Stanford → Melbourne
  // Europe internal / cross
  [[51.75, -1.25], [47.38, 8.55]],       // Oxford → ETH Zurich
  [[47.38, 8.55], [32.77, 35.02]],       // ETH → Technion
  // Asia internal
  [[35.69, 139.69], [1.30, 103.78]],     // Tokyo → NUS
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
  [43.66, -79.40], [49.27, -123.22], [45.42, -75.68], [45.50, -73.58],
  [51.08, -114.13], [53.52, -113.53],
  [51.75, -1.25], [52.21, 0.12], [51.50, -0.17], [51.52, -0.13],
  [55.95, -3.19], [53.47, -2.23],
  [47.38, 8.55], [46.52, 6.57], [48.15, 11.57], [49.41, 8.71],
  [50.88, 4.70], [48.85, 2.35], [52.37, 4.90], [59.35, 18.07],
  [59.91, 10.74], [60.19, 24.83], [55.70, 12.56], [53.35, -6.26],
  [41.39, 2.15], [40.41, -3.68], [52.52, 13.40],
  [32.07, 34.82], [31.90, 34.80], [32.77, 35.02],
  [35.69, 139.69], [35.03, 135.78], [37.59, 127.02], [39.99, 116.31],
  [31.02, 121.44], [1.30, 103.78], [22.28, 114.18],
  [19.08, 72.88], [12.91, 77.57], [28.54, 77.19],
  [-37.80, 144.96], [-33.89, 151.19], [-27.50, 153.01],
  [24.47, 54.37], [25.28, 51.49],
];

const CYCLE_S = 6;

const CONTINENT_PATHS = [
  // North America
  "M 33,108 Q 55,75 67,53 Q 92,60 119,79 Q 147,111 153,120 Q 159,133 162,148 Q 167,166 170,183 Q 180,208 205,220 Q 235,228 278,228 L 285,214 Q 280,195 278,180 Q 274,164 260,168 Q 245,173 231,179 Q 215,196 210,206 Q 225,193 254,170 Q 270,160 280,156 Q 295,150 315,129 Q 330,118 353,120 Q 349,95 322,76 Q 308,57 286,48 Q 308,38 320,42 Q 330,33 310,35 Q 285,47 278,60 Q 265,62 252,65 Q 234,65 218,68 Q 200,72 183,80 Q 164,90 148,103 Q 140,110 140,130 Q 120,130 100,125 Q 72,118 50,108 Z",
  // South America
  "M 278,228 L 288,228 Q 320,218 340,220 Q 378,258 395,278 Q 403,293 400,315 Q 395,340 376,370 Q 356,397 332,408 Q 316,406 298,392 Q 282,370 273,340 Q 264,306 267,280 Q 268,258 275,242 Z",
  // Europe (mainland + Scandinavia)
  "M 475,150 Q 488,133 490,125 Q 494,113 500,108 Q 508,110 515,103 Q 525,93 528,91 Q 528,88 516,79 Q 530,68 555,60 Q 568,55 577,53 Q 582,56 580,60 Q 575,70 567,78 Q 568,90 554,100 Q 540,102 533,100 Q 534,116 525,128 Q 519,131 515,130 Q 511,128 505,128 Q 504,137 511,148 Q 520,157 530,165 Q 543,163 548,155 Q 557,148 562,147 Q 571,148 576,148 Q 583,135 597,134 Q 610,133 614,137 Q 614,148 606,156 Q 595,163 580,165 Q 564,164 550,170 Q 530,172 510,165 Q 492,158 475,150 Z",
  // Africa
  "M 451,150 Q 475,148 492,148 Q 512,150 532,156 Q 555,160 580,166 Q 598,175 612,186 Q 632,196 642,218 Q 646,236 640,256 Q 632,276 620,296 Q 606,320 590,340 Q 571,360 551,372 Q 535,379 520,381 Q 502,377 486,361 Q 469,341 456,316 Q 443,287 441,260 Q 436,233 441,208 Q 446,186 448,168 Z",
  // Asia (central + east)
  "M 580,166 Q 600,158 614,137 Q 620,128 633,128 Q 646,126 656,122 Q 671,118 689,110 Q 706,98 716,90 Q 730,82 750,75 Q 768,68 786,62 Q 800,58 815,58 Q 830,58 845,62 Q 858,66 867,74 Q 875,81 878,91 Q 882,101 882,111 Q 880,126 875,139 Q 868,153 860,166 Q 848,179 836,191 Q 820,201 808,213 Q 792,226 780,239 Q 766,253 750,263 Q 735,273 721,279 Q 703,285 688,280 Q 672,273 661,261 Q 647,249 635,239 Q 622,228 612,218 Q 600,209 590,200 Q 580,192 577,180 Z",
  // India
  "M 642,220 Q 652,236 655,256 Q 657,276 649,296 Q 637,313 623,319 Q 611,319 601,307 Q 593,293 593,273 Q 595,251 605,236 Q 617,222 631,218 Z",
  // SE Asia peninsula
  "M 721,280 Q 736,291 743,306 Q 745,321 739,336 Q 731,346 721,346 Q 711,346 704,336 Q 697,323 699,309 Q 703,295 713,285 Z",
  // Australia
  "M 792,290 Q 810,280 833,280 Q 856,280 873,287 Q 888,296 896,313 Q 901,330 899,347 Q 896,364 887,377 Q 875,390 859,397 Q 841,402 823,400 Q 804,397 789,386 Q 773,373 766,355 Q 759,336 763,317 Q 768,300 780,291 Z",
  // Greenland
  "M 345,20 Q 378,15 410,22 Q 436,29 448,44 Q 451,57 436,69 Q 416,82 393,83 Q 373,83 356,73 Q 340,61 338,44 Z",
  // UK + Ireland
  "M 498,108 Q 504,100 511,107 Q 509,119 500,123 Q 494,118 498,108 Z",
  // Japan
  "M 882,120 Q 892,112 900,117 Q 906,127 901,138 Q 892,144 883,140 Q 876,132 882,120 Z",
  // Korean peninsula
  "M 865,136 Q 873,129 879,136 Q 879,149 869,153 Q 862,149 865,136 Z",
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

  const landStroke = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.20)";
  const dotColor = isDark ? "hsl(142 65% 60%)" : "hsl(142 52% 36%)";
  const arcColor = isDark ? "hsl(142 65% 55%)" : "hsl(142 52% 36%)";
  const arcOpacity = isDark ? 0.60 : 0.50;
  const gridColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  const dotCoords = useMemo(
    () => TTO_DOTS.map(([lat, lng]) => project(lat, lng)),
    []
  );

  const arcData = useMemo(
    () =>
      ARC_PAIRS.map(([[lat1, lng1], [lat2, lng2]], i) => ({
        d: arcPath(lat1, lng1, lat2, lng2),
        delay: (i / ARC_PAIRS.length) * CYCLE_S * 0.9,
      })),
    []
  );

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

          {/* Continent outlines — stroke only, no fill */}
          {CONTINENT_PATHS.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={landStroke}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}

          {/* TTO location dots */}
          {dotCoords.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={2.4}
              fill={dotColor}
              opacity={0.68}
            />
          ))}

          {/* Animated arcs — all 20, staggered */}
          {inView &&
            arcData.map(({ d, delay }, i) => (
              <g key={i}>
                <motion.path
                  d={d}
                  fill="none"
                  stroke={arcColor}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 1, 0],
                    opacity: [0, arcOpacity, arcOpacity, 0],
                  }}
                  transition={{
                    pathLength: {
                      duration: CYCLE_S,
                      delay,
                      repeat: Infinity,
                      repeatDelay: 1.2,
                      ease: "easeInOut",
                    },
                    opacity: {
                      duration: CYCLE_S,
                      delay,
                      repeat: Infinity,
                      repeatDelay: 1.2,
                      ease: "easeInOut",
                      times: [0, 0.18, 0.82, 1],
                    },
                  }}
                />
                <motion.circle
                  r={3.5}
                  fill={arcColor}
                  initial={{ opacity: 0 }}
                >
                  <animateMotion
                    path={d}
                    dur={`${CYCLE_S}s`}
                    begin={`${delay}s`}
                    repeatCount="indefinite"
                    calcMode="spline"
                    keySplines="0.4 0 0.6 1"
                  />
                  <animate
                    attributeName="opacity"
                    values={`0;${arcOpacity};${arcOpacity};0`}
                    keyTimes="0;0.18;0.82;1"
                    dur={`${CYCLE_S}s`}
                    begin={`${delay}s`}
                    repeatCount="indefinite"
                  />
                </motion.circle>
              </g>
            ))}
        </g>
      </svg>
    </div>
  );
}
