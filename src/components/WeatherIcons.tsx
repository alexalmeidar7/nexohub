import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

const Sun: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="32" cy="32" r="10">
      <animate attributeName="r" values="10;11;10" dur="3s" repeatCount="indefinite" />
    </circle>
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
      const rad = (angle * Math.PI) / 180;
      const x1 = 32 + Math.cos(rad) * 16;
      const y1 = 32 + Math.sin(rad) * 16;
      const x2 = 32 + Math.cos(rad) * 22;
      const y2 = 32 + Math.sin(rad) * 22;
      return (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}>
          <animate attributeName="opacity" values="1;0.4;1" dur="2.5s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
        </line>
      );
    })}
    <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="30s" repeatCount="indefinite" />
  </svg>
);

const Moon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M36 18a14 14 0 1 0 0 28A11 11 0 0 1 36 18z">
      <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
    </path>
    <circle cx="44" cy="20" r="1" stroke="none" fill="white" opacity="0.6">
      <animate attributeName="opacity" values="0.2;0.8;0.2" dur="3s" repeatCount="indefinite" />
    </circle>
    <circle cx="50" cy="30" r="0.8" stroke="none" fill="white" opacity="0.4">
      <animate attributeName="opacity" values="0.1;0.7;0.1" dur="3.5s" repeatCount="indefinite" />
    </circle>
    <circle cx="46" cy="38" r="0.6" stroke="none" fill="white" opacity="0.5">
      <animate attributeName="opacity" values="0.3;0.9;0.3" dur="2.8s" repeatCount="indefinite" />
    </circle>
  </svg>
);

const Cloud: React.FC<IconProps & { color?: string }> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;2,0;0,0" dur="5s" repeatCount="indefinite" />
      <path d="M20 40a10 10 0 0 1 .5-20 14 14 0 0 1 27 0A8 8 0 0 1 44 40Z" />
    </g>
  </svg>
);

const PartlyCloudy: React.FC<IconProps & { night?: boolean }> = ({ size = 48, className, night }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {!night ? (
      <g>
        <circle cx="24" cy="20" r="7">
          <animate attributeName="r" values="7;8;7" dur="3s" repeatCount="indefinite" />
        </circle>
        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line key={i} x1={24 + Math.cos(rad) * 10} y1={20 + Math.sin(rad) * 10}
              x2={24 + Math.cos(rad) * 13} y2={20 + Math.sin(rad) * 13}>
              <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
            </line>
          );
        })}
      </g>
    ) : (
      <path d="M28 10a10 10 0 1 0 0 18A8 8 0 0 1 28 10z">
        <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
      </path>
    )}
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;2,0;0,0" dur="5s" repeatCount="indefinite" />
      <path d="M22 46a8 8 0 0 1 .4-16 12 12 0 0 1 23 0A7 7 0 0 1 42 46Z" />
    </g>
  </svg>
);

const Rain: React.FC<IconProps & { heavy?: boolean }> = ({ size = 48, className, heavy }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="5s" repeatCount="indefinite" />
      <path d="M18 34a9 9 0 0 1 .4-18 13 13 0 0 1 25 0A7 7 0 0 1 42 34Z" />
    </g>
    {[22, 30, 38, 46].slice(0, heavy ? 4 : 3).map((x, i) => (
      <line key={i} x1={x} y1={38} x2={x - 3} y2={50} opacity="0.8">
        <animate attributeName="y1" values="38;40;38" dur="0.7s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
        <animate attributeName="y2" values="50;56;50" dur="0.7s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.2;0.9" dur="0.7s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
      </line>
    ))}
  </svg>
);

const Drizzle: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="5s" repeatCount="indefinite" />
      <path d="M18 32a9 9 0 0 1 .4-18 13 13 0 0 1 25 0A7 7 0 0 1 42 32Z" />
    </g>
    {[24, 32, 40].map((x, i) => (
      <circle key={i} cx={x} cy={42} r="1.2" fill="white" stroke="none">
        <animate attributeName="cy" values="38;52;38" dur="1.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0;1" dur="1.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
      </circle>
    ))}
  </svg>
);

const Snow: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="5s" repeatCount="indefinite" />
      <path d="M18 30a9 9 0 0 1 .4-18 13 13 0 0 1 25 0A7 7 0 0 1 42 30Z" />
    </g>
    {[22, 32, 42].map((x, i) => (
      <g key={i}>
        <line x1={x} y1={34} x2={x} y2={42}>
          <animate attributeName="y1" values="34;38;34" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="y2" values="42;52;42" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.2;1" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
        </line>
        <line x1={x - 3} y1={38} x2={x + 3} y2={38}>
          <animate attributeName="y1" values="38;42;38" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="y2" values="38;42;38" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.2;1" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
        </line>
      </g>
    ))}
  </svg>
);

const Thunderstorm: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="3s" repeatCount="indefinite" />
      <path d="M18 30a9 9 0 0 1 .4-18 13 13 0 0 1 25 0A7 7 0 0 1 42 30Z" />
    </g>
    <polyline points="30,32 26,42 34,42 28,54" strokeWidth="2.5">
      <animate attributeName="opacity" values="1;0.1;1;0.1;1" dur="1.2s" repeatCount="indefinite" />
    </polyline>
    {[22, 42].map((x, i) => (
      <line key={i} x1={x} y1={34} x2={x - 2} y2={46} strokeWidth="1.5">
        <animate attributeName="opacity" values="0.8;0;0.8" dur="0.8s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
      </line>
    ))}
  </svg>
);

const Fog: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
    {[22, 30, 38, 46].map((y, i) => (
      <line key={i} x1="12" y1={y} x2="52" y2={y}>
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="translate" values="0,0;3,0;0,0" dur="4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
      </line>
    ))}
  </svg>
);

const SunRain: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <g>
      <circle cx="20" cy="18" r="6">
        <animate attributeName="r" values="6;7;6" dur="3s" repeatCount="indefinite" />
      </circle>
      {[0, 72, 144, 216, 288].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <line key={i} x1={20 + Math.cos(rad) * 9} y1={18 + Math.sin(rad) * 9}
            x2={20 + Math.cos(rad) * 12} y2={18 + Math.sin(rad) * 12}>
            <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          </line>
        );
      })}
    </g>
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1.5,0;0,0" dur="5s" repeatCount="indefinite" />
      <path d="M24 40a7 7 0 0 1 .3-14 11 11 0 0 1 21 0A6 6 0 0 1 42 40Z" />
    </g>
    {[28, 36, 44].map((x, i) => (
      <line key={i} x1={x} y1={44} x2={x - 2} y2={54} strokeWidth="1.5">
        <animate attributeName="y2" values="52;58;52" dur="0.8s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.15;0.8" dur="0.8s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
      </line>
    ))}
  </svg>
);

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
  const isNight = !forceDay && new Date().getHours() >= 18 || (!forceDay && new Date().getHours() < 6);
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
