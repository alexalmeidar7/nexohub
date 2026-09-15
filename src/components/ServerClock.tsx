import { useState, useEffect } from "react";

export default function ServerClock({ timezone }: { timezone?: string | null }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const tz = timezone && timezone.length > 0 ? timezone : undefined;
  let hours: string;
  let seconds: string;
  try {
    hours = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    seconds = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      second: "2-digit",
      hour12: false,
    }).format(now).padStart(2, "0");
  } catch {
    hours = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    seconds = String(now.getSeconds()).padStart(2, "0");
  }

  return (
    <div className="text-right" title={tz ? `Fuso: ${tz}` : undefined}>
      <span
        className="font-light tracking-wider inline-flex items-start"
        style={{ fontFamily: "Poppins, sans-serif", fontSize: "24px", lineHeight: 1.1, color: "#002132" }}
      >
        {hours}
        <span
          className="font-light inline-block"
          style={{ fontSize: "11px", width: "18px", textAlign: "left", marginTop: "2px", color: "#002132", opacity: 0.7 }}
        >
          {seconds}
        </span>
      </span>
    </div>
  );
}
