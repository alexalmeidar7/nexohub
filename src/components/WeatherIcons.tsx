import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

const Sun: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <circle cx="32" cy="32" r="12" fill="#FFB800">
      <animate attributeName="r" values="12;13;12" dur="2s" repeatCount="indefinite" />
    </circle>
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
      const rad = (angle * Math.PI) / 180;
      const x1 = 32 + Math.cos(rad) * 17;
      const y1 = 32 + Math.sin(rad) * 17;
      const x2 = 32 + Math.cos(rad) * 23;
      const y2 = 32 + Math.sin(rad) * 23;
      return (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFB800" strokeWidth="2.5" strokeLinecap="round">
          <animate attributeName="opacity" values="1;0.5;1" dur="2s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
        </line>
      );
    })}
    <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="20s" repeatCount="indefinite" />
  </svg>
);

const Moon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <path d="M38 16a18 18 0 1 0 0 32 14 14 0 0 1 0-32z" fill="#5C6BC0">
      <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" repeatCount="indefinite" />
    </path>
    <circle cx="44" cy="22" r="1.2" fill="#C5CAE9" opacity="0.7">
      <animate attributeName="opacity" values="0.3;0.9;0.3" dur="2s" repeatCount="indefinite" />
    </circle>
    <circle cx="48" cy="30" r="0.8" fill="#C5CAE9" opacity="0.5">
      <animate attributeName="opacity" values="0.2;0.8;0.2" dur="2.5s" repeatCount="indefinite" />
    </circle>
  </svg>
);

const Cloud: React.FC<IconProps & { color?: string }> = ({ size = 48, className, color = "#90A4AE" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;2,0;0,0" dur="4s" repeatCount="indefinite" />
      <ellipse cx="32" cy="34" rx="18" ry="10" fill={color} />
      <circle cx="24" cy="28" r="10" fill={color} />
      <circle cx="36" cy="25" r="12" fill={color} />
      <circle cx="42" cy="30" r="8" fill={color} />
    </g>
  </svg>
);

const PartlyCloudy: React.FC<IconProps & { night?: boolean }> = ({ size = 48, className, night }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    {!night ? (
      <g>
        <circle cx="22" cy="22" r="9" fill="#FFB800">
          <animate attributeName="r" values="9;10;9" dur="2s" repeatCount="indefinite" />
        </circle>
        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line key={i} x1={22 + Math.cos(rad) * 12} y1={22 + Math.sin(rad) * 12}
              x2={22 + Math.cos(rad) * 15} y2={22 + Math.sin(rad) * 15}
              stroke="#FFB800" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="opacity" values="1;0.4;1" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
            </line>
          );
        })}
      </g>
    ) : (
      <path d="M26 12a12 12 0 1 0 0 20 9 9 0 0 1 0-20z" fill="#5C6BC0">
        <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" repeatCount="indefinite" />
      </path>
    )}
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;2,0;0,0" dur="4s" repeatCount="indefinite" />
      <ellipse cx="36" cy="40" rx="16" ry="9" fill="#B0BEC5" />
      <circle cx="28" cy="35" r="9" fill="#B0BEC5" />
      <circle cx="40" cy="32" r="10" fill="#B0BEC5" />
      <circle cx="46" cy="37" r="7" fill="#B0BEC5" />
    </g>
  </svg>
);

const Rain: React.FC<IconProps & { heavy?: boolean }> = ({ size = 48, className, heavy }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="5s" repeatCount="indefinite" />
      <ellipse cx="32" cy="24" rx="18" ry="10" fill="#78909C" />
      <circle cx="24" cy="18" r="10" fill="#78909C" />
      <circle cx="36" cy="15" r="12" fill="#78909C" />
      <circle cx="42" cy="20" r="8" fill="#78909C" />
    </g>
    {[20, 28, 36, 44].slice(0, heavy ? 4 : 3).map((x, i) => (
      <line key={i} x1={x} y1={34} x2={x - 3} y2={48} stroke="#42A5F5" strokeWidth="2" strokeLinecap="round">
        <animate attributeName="y1" values="34;36;34" dur="0.8s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        <animate attributeName="y2" values="46;52;46" dur="0.8s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="0.8s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
      </line>
    ))}
  </svg>
);

const Drizzle: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="5s" repeatCount="indefinite" />
      <ellipse cx="32" cy="24" rx="18" ry="10" fill="#90A4AE" />
      <circle cx="24" cy="18" r="10" fill="#90A4AE" />
      <circle cx="36" cy="15" r="12" fill="#90A4AE" />
      <circle cx="42" cy="20" r="8" fill="#90A4AE" />
    </g>
    {[24, 32, 40].map((x, i) => (
      <circle key={i} cx={x} cy={40} r="1.5" fill="#64B5F6">
        <animate attributeName="cy" values="36;50;36" dur="1.2s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0;1" dur="1.2s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
      </circle>
    ))}
  </svg>
);

const Snow: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="5s" repeatCount="indefinite" />
      <ellipse cx="32" cy="22" rx="18" ry="10" fill="#B0BEC5" />
      <circle cx="24" cy="16" r="10" fill="#B0BEC5" />
      <circle cx="36" cy="13" r="12" fill="#B0BEC5" />
      <circle cx="42" cy="18" r="8" fill="#B0BEC5" />
    </g>
    {[22, 32, 42].map((x, i) => (
      <g key={i}>
        <circle cx={x} cy={40} r="2.5" fill="#E3F2FD" stroke="#90CAF9" strokeWidth="0.5">
          <animate attributeName="cy" values="34;52;34" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.2;1" dur="2s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
        </circle>
      </g>
    ))}
  </svg>
);

const Thunderstorm: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="3s" repeatCount="indefinite" />
      <ellipse cx="32" cy="22" rx="18" ry="10" fill="#546E7A" />
      <circle cx="24" cy="16" r="10" fill="#546E7A" />
      <circle cx="36" cy="13" r="12" fill="#546E7A" />
      <circle cx="42" cy="18" r="8" fill="#546E7A" />
    </g>
    <polygon points="30,30 26,42 32,42 28,56 40,38 34,38 38,30" fill="#FDD835">
      <animate attributeName="opacity" values="1;0.2;1;0.2;1" dur="1.5s" repeatCount="indefinite" />
    </polygon>
    {[22, 40].map((x, i) => (
      <line key={i} x1={x} y1={32} x2={x - 2} y2={44} stroke="#42A5F5" strokeWidth="1.5" strokeLinecap="round">
        <animate attributeName="opacity" values="0.7;0;0.7" dur="0.9s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
      </line>
    ))}
  </svg>
);

const Fog: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    {[22, 30, 38].map((y, i) => (
      <rect key={i} x="12" y={y} width="40" height="3" rx="1.5" fill="#B0BEC5">
        <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="translate" values="0,0;3,0;0,0" dur="3s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
      </rect>
    ))}
  </svg>
);

const SunRain: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
    <circle cx="18" cy="18" r="7" fill="#FFB800">
      <animate attributeName="r" values="7;8;7" dur="2s" repeatCount="indefinite" />
    </circle>
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;1.5,0;0,0" dur="4s" repeatCount="indefinite" />
      <ellipse cx="36" cy="30" rx="15" ry="8" fill="#90A4AE" />
      <circle cx="28" cy="25" r="8" fill="#90A4AE" />
      <circle cx="38" cy="23" r="10" fill="#90A4AE" />
      <circle cx="44" cy="27" r="6" fill="#90A4AE" />
    </g>
    {[28, 36, 44].map((x, i) => (
      <line key={i} x1={x} y1={38} x2={x - 2} y2={50} stroke="#42A5F5" strokeWidth="1.5" strokeLinecap="round">
        <animate attributeName="y2" values="48;54;48" dur="0.9s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.2;0.7" dur="0.9s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
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
