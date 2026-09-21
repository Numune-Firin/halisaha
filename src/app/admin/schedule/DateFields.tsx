/**
 * Tarih secimi, her zaman gun / ay / yil.
 *
 * Tarayicinin kendi <input type="date"> alani kendi dil ayarina gore bicim
 * secer; Chrome Ingilizce oldugunda 09/12/2026 "9 Aralik" olarak kaydedilip
 * "12 Eylul" saniliyordu. Uc acilir liste bu belirsizligi kaldirir; deger
 * sunucuda "YYYY-MM-DD" olarak birlestirilir, bos birakilirsa sinir yoktur.
 */
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

export function DateFields({
  name,
  label,
  defaultValue,
  hint,
}: {
  /** Form alan adi; sunucuya <name>Day, <name>Month, <name>Year olarak gider */
  name: string;
  label: string;
  /** "2026-09-18" bicimi ya da bos */
  defaultValue?: string | null;
  hint?: string;
}) {
  const [year = '', month = '', day = ''] = (defaultValue ?? '').split('-');
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => String(thisYear - 1 + i));

  return (
    <div className="field">
      <label className="label" htmlFor={`${name}Day`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <select
          id={`${name}Day`}
          name={`${name}Day`}
          defaultValue={day}
          aria-label={`${label} — gün`}
          className="input w-20"
        >
          <option value="">–</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          name={`${name}Month`}
          defaultValue={month}
          aria-label={`${label} — ay`}
          className="input w-32"
        >
          <option value="">–</option>
          {MONTHS.map((label_, i) => (
            <option key={label_} value={String(i + 1).padStart(2, '0')}>
              {label_}
            </option>
          ))}
        </select>

        <select
          name={`${name}Year`}
          defaultValue={year}
          aria-label={`${label} — yıl`}
          className="input w-24"
        >
          <option value="">–</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
