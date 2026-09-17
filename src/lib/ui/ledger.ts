/** Kasa hareketlerinin tek kaynagi: tur, kategori ve ekrandaki karsiliklari. */
export type LedgerDirection = 'income' | 'expense';

export type LedgerCategory =
  | 'donation'
  | 'other_income'
  | 'field_fee'
  | 'refreshment'
  | 'equipment'
  | 'other_expense';

export const LEDGER_CATEGORY_LABELS: Record<LedgerCategory, string> = {
  donation: 'Bağış',
  other_income: 'Diğer gelir',
  field_fee: 'Halı saha ücreti',
  refreshment: 'İkram',
  equipment: 'Malzeme',
  other_expense: 'Ek masraf',
};

/** Kategori hangi tarafa yazilir; form ve dogrulama bunu kullanir. */
export const LEDGER_CATEGORY_DIRECTION: Record<LedgerCategory, LedgerDirection> = {
  donation: 'income',
  other_income: 'income',
  field_fee: 'expense',
  refreshment: 'expense',
  equipment: 'expense',
  other_expense: 'expense',
};

export const INCOME_CATEGORIES = (
  Object.keys(LEDGER_CATEGORY_DIRECTION) as LedgerCategory[]
).filter((c) => LEDGER_CATEGORY_DIRECTION[c] === 'income');

export const EXPENSE_CATEGORIES = (
  Object.keys(LEDGER_CATEGORY_DIRECTION) as LedgerCategory[]
).filter((c) => LEDGER_CATEGORY_DIRECTION[c] === 'expense');

export function parseLedgerCategory(value: FormDataEntryValue | null): LedgerCategory {
  const raw = String(value ?? '');
  if (raw in LEDGER_CATEGORY_DIRECTION) return raw as LedgerCategory;
  throw new Error('Geçerli bir kategori seç');
}

export const money = (value: number) => `${value.toLocaleString('tr-TR')} ₺`;
