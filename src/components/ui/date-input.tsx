import * as React from "react";
import { CalendarDays } from "lucide-react";

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue"> & {
  value?: string | null;
  defaultValue?: string | null;
};

const isoToBr = (iso?: string | null) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

const brToIso = (br: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const valid = date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d);
  return valid ? `${y}-${m}-${d}` : null;
};

const maskBr = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/** Campo de data sempre exibido como DD/MM/AAAA; o valor entregue ao onChange continua em ISO (AAAA-MM-DD). */
const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, defaultValue, onChange, onBlur, className, style, disabled, min, max, ...rest }, ref) => {
    const controlled = value !== undefined;
    const [internalIso, setInternalIso] = React.useState(defaultValue || "");
    const iso = controlled ? value || "" : internalIso;
    const [text, setText] = React.useState(isoToBr(iso));
    const pickerRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
      // Só sincroniza quando o valor externo difere do que já foi digitado.
      setText((current) => (brToIso(current) === (iso || null) || (!iso && current.length < 10 && current !== "") ? current : isoToBr(iso)));
    }, [iso]);

    const emit = (next: string, name?: string) => {
      if (!controlled) setInternalIso(next);
      const target = { value: next, name: name ?? rest.name ?? "", id: rest.id ?? "" };
      onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>);
    };

    const handleText = (event: React.ChangeEvent<HTMLInputElement>) => {
      const masked = maskBr(event.target.value);
      setText(masked);
      if (masked === "") emit("");
      else {
        const parsed = brToIso(masked);
        if (parsed) emit(parsed);
      }
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (text && !brToIso(text)) {
        setText(isoToBr(iso));
      }
      onBlur?.(event);
    };

    return (
      <span className="relative inline-flex w-full items-center">
        <input
          {...rest}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/AAAA"
          maxLength={10}
          value={text}
          disabled={disabled}
          onChange={handleText}
          onBlur={handleBlur}
          className={className}
          style={{ ...style, paddingRight: 30 }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Abrir calendário"
          onClick={() => {
            const picker = pickerRef.current;
            if (!picker) return;
            try { picker.showPicker(); } catch { picker.focus(); picker.click(); }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
          style={{ background: "transparent", border: 0, padding: 0, lineHeight: 0, color: "inherit" }}
        >
          <CalendarDays size={14} />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={iso}
          min={typeof min === "string" ? min : undefined}
          max={typeof max === "string" ? max : undefined}
          onChange={(event) => {
            setText(isoToBr(event.target.value));
            emit(event.target.value);
          }}
          style={{ position: "absolute", right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      </span>
    );
  },
);
DateInput.displayName = "DateInput";

export { DateInput };
