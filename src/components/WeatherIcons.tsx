import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

// Shared defs (gradients + glow filter). Namespaced per icon via uid to avoid collisions.
const Defs: React.FC<{ uid: string; grads: Array<{ id: string; from: string; to: string; type?: "linear" | "radial" }> }> = ({ uid, grads }) => (
  <defs>
    <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.6" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    {grads.map((g) =>
      g.type === "radial" ? (
        <radialGradient key={g.id} id={`${uid}-${g.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={g.from} />
          <stop offset="100%" stopColor={g.to} />
        </radialGradient>
      ) : (
        <linearGradient key={g.id} id={`${uid}-${g.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={g.from} />
          <stop offset="100%" stopColor={g.to} />
        </linearGradient>
      ),
    )}
  </defs>
);

let idCounter = 0;
const useUid = (prefix: string) => {
  const ref = React.useRef<string | null>(null);
  if (!ref.current) ref.current = `${prefix}-${++idCounter}`;
  return ref.current;
};

const Sun: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("sun");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "core", from: "#FFF3A8", to: "#FFB020", type: "radial" },
        { id: "halo", from: "#FFE47A", to: "#FFB020", type: "radial" },
      ]} />
      {/* Halo */}
      <circle cx="32" cy="32" r="16" fill={`url(#${uid}-halo)`} opacity="0.35">
        <animate attributeName="r" values="15;18;15" dur="3.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.25;0.5;0.25" dur="3.5s" repeatCount="indefinite" />
      </circle>
      {/* Rays */}
      <g stroke="#FFC94A" strokeWidth="3" strokeLinecap="round" filter={`url(#${uid}-glow)`}>
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="24s" repeatCount="indefinite" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const x1 = 32 + Math.cos(rad) * 17;
          const y1 = 32 + Math.sin(rad) * 17;
          const x2 = 32 + Math.cos(rad) * 24;
          const y2 = 32 + Math.sin(rad) * 24;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}>
              <animate attributeName="opacity" values="1;0.35;1" dur="2.4s" begin={`${i * 0.28}s`} repeatCount="indefinite" />
            </line>
          );
        })}
      </g>
      {/* Core */}
      <circle cx="32" cy="32" r="11" fill={`url(#${uid}-core)`} stroke="#FFA000" strokeWidth="1">
        <animate attributeName="r" values="10.5;11.8;10.5" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

const Moon: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("moon");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "halo", from: "#DDEBFF", to: "#5C7CFA", type: "radial" },
        { id: "moon", from: "#FFF9E6", to: "#FFE38A" },
      ]} />
      <circle cx="34" cy="30" r="18" fill={`url(#${uid}-halo)`} opacity="0.3">
        <animate attributeName="opacity" values="0.2;0.45;0.2" dur="4s" repeatCount="indefinite" />
      </circle>
      <path d="M38 16a14 14 0 1 0 0 28A11 11 0 0 1 38 16z" fill={`url(#${uid}-moon)`} stroke="#EAD37A" strokeWidth="1.2" filter={`url(#${uid}-glow)`}>
        <animate attributeName="opacity" values="0.9;1;0.9" dur="4s" repeatCount="indefinite" />
      </path>
      {[
        { cx: 48, cy: 16, r: 1.2, dur: "2.8s" },
        { cx: 54, cy: 26, r: 0.9, dur: "3.4s" },
        { cx: 50, cy: 40, r: 0.7, dur: "3s" },
        { cx: 18, cy: 14, r: 0.8, dur: "3.6s" },
        { cx: 12, cy: 34, r: 0.7, dur: "3.1s" },
      ].map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#FFFFFF">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={s.dur} begin={`${i * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
};

const CloudShape: React.FC<{ fill: string; stroke: string; d?: string; filter?: string }> = ({ fill, stroke, d, filter }) => (
  <path d={d || "M18 44a11 11 0 0 1 .6-22 15 15 0 0 1 29 0A9 9 0 0 1 45 44Z"} fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" filter={filter} />
);

const Cloud: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("cloud");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[{ id: "c", from: "#FFFFFF", to: "#B8C6D9" }]} />
      <g filter={`url(#${uid}-glow)`}>
        <animateTransform attributeName="transform" type="translate" values="-1,0;2,0;-1,0" dur="6s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-c)`} stroke="#8CA0BC" />
      </g>
    </svg>
  );
};

const PartlyCloudy: React.FC<IconProps & { night?: boolean }> = ({ size = 48, className, night }) => {
  const uid = useUid("pc");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "sun", from: "#FFF3A8", to: "#FFB020", type: "radial" },
        { id: "moon", from: "#FFF9E6", to: "#FFE38A" },
        { id: "cloud", from: "#FFFFFF", to: "#B8C6D9" },
      ]} />
      {!night ? (
        <g filter={`url(#${uid}-glow)`}>
          <circle cx="24" cy="20" r="14" fill={`url(#${uid}-sun)`} opacity="0.35">
            <animate attributeName="r" values="12;16;12" dur="3.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0.45;0.25" dur="3.5s" repeatCount="indefinite" />
          </circle>
          <g stroke="#FFC94A" strokeWidth="2.2" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 24 20" to="360 24 20" dur="26s" repeatCount="indefinite" />
            {[0, 60, 120, 180, 240, 300].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              return (
                <line key={i} x1={24 + Math.cos(rad) * 10} y1={20 + Math.sin(rad) * 10}
                  x2={24 + Math.cos(rad) * 14} y2={20 + Math.sin(rad) * 14}>
                  <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                </line>
              );
            })}
          </g>
          <circle cx="24" cy="20" r="7" fill={`url(#${uid}-sun)`} stroke="#FFA000" strokeWidth="0.8">
            <animate attributeName="r" values="7;8;7" dur="3s" repeatCount="indefinite" />
          </circle>
        </g>
      ) : (
        <path d="M30 8a10 10 0 1 0 0 18A8 8 0 0 1 30 8z" fill={`url(#${uid}-moon)`} stroke="#EAD37A" strokeWidth="1" filter={`url(#${uid}-glow)`}>
          <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
        </path>
      )}
      <g>
        <animateTransform attributeName="transform" type="translate" values="-1,0;2,0;-1,0" dur="6s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-cloud)`} stroke="#8CA0BC" d="M22 48a9 9 0 0 1 .5-18 13 13 0 0 1 25 0A8 8 0 0 1 44 48Z" />
      </g>
    </svg>
  );
};

const Rain: React.FC<IconProps & { heavy?: boolean }> = ({ size = 48, className, heavy }) => {
  const uid = useUid("rain");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "c", from: "#E4EAF2", to: "#7C8DA6" },
        { id: "d", from: "#7DD3FC", to: "#2563EB" },
      ]} />
      <g>
        <animateTransform attributeName="transform" type="translate" values="-1,0;1,0;-1,0" dur="5s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-c)`} stroke="#4A5A73" d="M18 34a10 10 0 0 1 .5-20 14 14 0 0 1 27 0A8 8 0 0 1 44 34Z" />
      </g>
      {[22, 30, 38, 46].slice(0, heavy ? 4 : 3).map((x, i) => (
        <g key={i}>
          <path d={`M${x} 38 L${x - 2} 46 Q${x - 1} 48 ${x + 0.5} 47 Z`} fill={`url(#${uid}-d)`} stroke="#2563EB" strokeWidth="0.5">
            <animateTransform attributeName="transform" type="translate" values="0,0;0,12;0,0" dur="1s" begin={`${i * 0.18}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.15;1" dur="1s" begin={`${i * 0.18}s`} repeatCount="indefinite" />
          </path>
        </g>
      ))}
    </svg>
  );
};

const Drizzle: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("driz");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "c", from: "#EEF2F8", to: "#95A6BF" },
        { id: "d", from: "#BAE6FD", to: "#38BDF8", type: "radial" },
      ]} />
      <g>
        <animateTransform attributeName="transform" type="translate" values="-1,0;1,0;-1,0" dur="5s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-c)`} stroke="#6E8099" d="M18 32a9 9 0 0 1 .4-18 13 13 0 0 1 25 0A7 7 0 0 1 42 32Z" />
      </g>
      {[24, 32, 40].map((x, i) => (
        <circle key={i} cx={x} cy={40} r="1.6" fill={`url(#${uid}-d)`}>
          <animate attributeName="cy" values="36;54;36" dur="1.6s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0;1" dur="1.6s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
};

const Snow: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("snow");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "c", from: "#F5F8FC", to: "#B0C1D9" },
      ]} />
      <g>
        <animateTransform attributeName="transform" type="translate" values="-1,0;1,0;-1,0" dur="6s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-c)`} stroke="#7C93B3" d="M18 30a9 9 0 0 1 .4-18 13 13 0 0 1 25 0A7 7 0 0 1 42 30Z" />
      </g>
      {[22, 32, 42].map((x, i) => (
        <g key={i} stroke="#E0F2FE" strokeWidth="1.5" strokeLinecap="round" filter={`url(#${uid}-glow)`}>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,12;0,0" dur="2.4s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.15;1" dur="2.4s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
            <line x1={x} y1={36} x2={x} y2={44} />
            <line x1={x - 3} y1={40} x2={x + 3} y2={40} />
            <line x1={x - 2.2} y1={37.8} x2={x + 2.2} y2={42.2} />
            <line x1={x + 2.2} y1={37.8} x2={x - 2.2} y2={42.2} />
          </g>
        </g>
      ))}
    </svg>
  );
};

const Thunderstorm: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("thu");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "c", from: "#8595AD", to: "#3A465C" },
        { id: "b", from: "#FFF3A8", to: "#F59E0B" },
      ]} />
      <g>
        <animateTransform attributeName="transform" type="translate" values="-1,0;1,0;-1,0" dur="3.5s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-c)`} stroke="#25324A" d="M18 30a9 9 0 0 1 .4-18 13 13 0 0 1 25 0A7 7 0 0 1 42 30Z" />
      </g>
      <polygon points="30,32 24,44 30,44 26,56 38,40 32,40 36,32" fill={`url(#${uid}-b)`} stroke="#B45309" strokeWidth="0.8" strokeLinejoin="round" filter={`url(#${uid}-glow)`}>
        <animate attributeName="opacity" values="1;0.1;1;0.2;1" dur="1.4s" repeatCount="indefinite" />
      </polygon>
      {[22, 42].map((x, i) => (
        <line key={i} x1={x} y1={34} x2={x - 2} y2={46} stroke="#7DD3FC" strokeWidth="1.5" strokeLinecap="round">
          <animate attributeName="opacity" values="0.8;0;0.8" dur="0.9s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values="0,0;0,8;0,0" dur="0.9s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
        </line>
      ))}
    </svg>
  );
};

const Fog: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("fog");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[{ id: "c", from: "#F0F3F8", to: "#B0BCCC" }]} />
      <g opacity="0.9">
        <animateTransform attributeName="transform" type="translate" values="-1,0;1,0;-1,0" dur="6s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-c)`} stroke="#8194AC" d="M14 24a8 8 0 0 1 .4-16 12 12 0 0 1 23 0A6 6 0 0 1 36 24Z" />
      </g>
      {[
        { y: 34, len: 44, x: 10, dur: "4s", d: 0 },
        { y: 42, len: 38, x: 14, dur: "5s", d: 0.5 },
        { y: 50, len: 42, x: 12, dur: "4.5s", d: 1 },
      ].map((l, i) => (
        <line key={i} x1={l.x} y1={l.y} x2={l.x + l.len} y2={l.y} stroke="#D0D9E6" strokeWidth="3" strokeLinecap="round" filter={`url(#${uid}-glow)`}>
          <animate attributeName="opacity" values="0.4;0.95;0.4" dur={l.dur} begin={`${l.d}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values="-3,0;4,0;-3,0" dur={l.dur} begin={`${l.d}s`} repeatCount="indefinite" />
        </line>
      ))}
    </svg>
  );
};

const SunRain: React.FC<IconProps> = ({ size = 48, className }) => {
  const uid = useUid("sr");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <Defs uid={uid} grads={[
        { id: "sun", from: "#FFF3A8", to: "#FFB020", type: "radial" },
        { id: "c", from: "#E4EAF2", to: "#7C8DA6" },
        { id: "d", from: "#7DD3FC", to: "#2563EB" },
      ]} />
      <g filter={`url(#${uid}-glow)`}>
        <circle cx="20" cy="18" r="12" fill={`url(#${uid}-sun)`} opacity="0.4">
          <animate attributeName="r" values="10;14;10" dur="3.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.5;0.3" dur="3.5s" repeatCount="indefinite" />
        </circle>
        <g stroke="#FFC94A" strokeWidth="2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 20 18" to="360 20 18" dur="26s" repeatCount="indefinite" />
          {[0, 72, 144, 216, 288].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            return (
              <line key={i} x1={20 + Math.cos(rad) * 9} y1={18 + Math.sin(rad) * 9}
                x2={20 + Math.cos(rad) * 12} y2={18 + Math.sin(rad) * 12}>
                <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
              </line>
            );
          })}
        </g>
        <circle cx="20" cy="18" r="6" fill={`url(#${uid}-sun)`} stroke="#FFA000" strokeWidth="0.6">
          <animate attributeName="r" values="6;7;6" dur="3s" repeatCount="indefinite" />
        </circle>
      </g>
      <g>
        <animateTransform attributeName="transform" type="translate" values="-1,0;1.5,0;-1,0" dur="5s" repeatCount="indefinite" />
        <CloudShape fill={`url(#${uid}-c)`} stroke="#4A5A73" d="M24 40a7 7 0 0 1 .3-14 11 11 0 0 1 21 0A6 6 0 0 1 42 40Z" />
      </g>
      {[28, 36, 44].map((x, i) => (
        <path key={i} d={`M${x} 42 L${x - 2} 50 Q${x - 1} 52 ${x + 0.5} 51 Z`} fill={`url(#${uid}-d)`} stroke="#2563EB" strokeWidth="0.5">
          <animateTransform attributeName="transform" type="translate" values="0,0;0,8;0,0" dur="1s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.15;1" dur="1s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        </path>
      ))}
    </svg>
  );
};

type WeatherIconType = "sun" | "moon" | "partly-cloudy-day" | "partly-cloudy-night" | "cloud" | "drizzle" | "rain" | "heavy-rain" | "sun-rain" | "snow" | "thunderstorm" | "fog";

const weatherCodeToIcon: Record<number, { day: WeatherIconType; night: WeatherIconType }> = {
  0:  { day: "sun",               night: "moon" },
  1:  { day: "partly-cloudy-day", night: "partly-cloudy-night" },
  2:  { day: "partly-cloudy-day", night: "partly-cloudy-night" },
  3:  { day: "cloud",             night: "cloud" },
  45: { day: "fog",               night: "fog" },
  48: { day: "fog",               night: "fog" },
  51: { day: "drizzle",           night: "drizzle" },
  53: { day: "drizzle",           night: "drizzle" },
  55: { day: "rain",              night: "rain" },
  61: { day: "rain",              night: "rain" },
  63: { day: "rain",              night: "rain" },
  65: { day: "heavy-rain",        night: "heavy-rain" },
  71: { day: "snow",              night: "snow" },
  73: { day: "snow",              night: "snow" },
  75: { day: "snow",              night: "snow" },
  80: { day: "sun-rain",          night: "rain" },
  81: { day: "rain",              night: "rain" },
  82: { day: "heavy-rain",        night: "heavy-rain" },
  95: { day: "thunderstorm",      night: "thunderstorm" },
  96: { day: "thunderstorm",      night: "thunderstorm" },
  99: { day: "thunderstorm",      night: "thunderstorm" },
};

function resolveIconType(code: number, forceDay: boolean): WeatherIconType {
  const codes = Object.keys(weatherCodeToIcon).map(Number);
  const closest = codes.reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  const entry = weatherCodeToIcon[closest] || weatherCodeToIcon[0];
  const isNight = (!forceDay && new Date().getHours() >= 18) || (!forceDay && new Date().getHours() < 6);
  return isNight ? entry.night : entry.day;
}

const iconComponents: Record<WeatherIconType, React.FC<IconProps>> = {
  "sun": Sun,
  "moon": Moon,
  "partly-cloudy-day": PartlyCloudy,
  "partly-cloudy-night": (props) => <PartlyCloudy {...props} night />,
  "cloud": Cloud,
  "drizzle": Drizzle,
  "rain": Rain,
  "heavy-rain": (props) => <Rain {...props} heavy />,
  "sun-rain": SunRain,
  "snow": Snow,
  "thunderstorm": Thunderstorm,
  "fog": Fog,
};

export function WeatherIcon({ code, size = 48, forceDay = false, className }: { code: number; size?: number; forceDay?: boolean; className?: string }) {
  const iconType = resolveIconType(code, forceDay);
  const Component = iconComponents[iconType];
  return <Component size={size} className={className} />;
}
