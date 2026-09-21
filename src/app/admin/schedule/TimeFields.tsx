/**
 * Saat secimi, her zaman 24 saatlik.
 *
 * Tarayicinin kendi <input type="time"> alani dilin ayarina gore 12 saatlik
 * AM/PM gosteriyor ve 11:08 kolayca 23:08 oluyordu. Iki acilir liste bu
 * belirsizligi tamamen kaldirir; deger sunucuda "HH:MM" olarak birlestirilir.
 */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimeFields({
  name,
  label,
  defaultValue,
  hint,
}: {
  /** Form alan adi; sunucuya <name>Hour ve <name>Minute olarak gider */
  name: string;
  label: string;
  /** "22:15" bicimi */
  defaultValue: string;
  hint?: string;
}) {
  const [hour = '20', minute = '00'] = defaultValue.split(':');

  return (
    <div className="field">
      <label className="label" htmlFor={`${name}Hour`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <select
          id={`${name}Hour`}
          name={`${name}Hour`}
          defaultValue={hour}
          aria-label={`${label} — saat`}
          className="input w-24"
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-ink-300">:</span>
        <select
          name={`${name}Minute`}
          defaultValue={minute}
          aria-label={`${label} — dakika`}
          className="input w-24"
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
