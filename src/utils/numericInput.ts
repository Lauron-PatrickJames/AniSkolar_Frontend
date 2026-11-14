import type React from 'react';

// Number-only inputs: what can be typed or pasted in. The server checks
// the same (the backend's utils/numberFields.js and the profile's own
// checks).

// Phone numbers: digits, with the spaces, dashes, brackets and leading +
// of the usual formats ("0917 123 4567", "(046) 481 1900", "+63…").
export const phoneChars = (v: string): string => v.replace(/[^\d\s()+-]/g, '').replace(/(?!^)\+/g, '');

// Whole numbers (zip codes, student numbers).
export const digitsOnly = (v: string): string => v.replace(/\D/g, '');

// Amounts and grades: digits and one decimal point.
export function decimalChars(v: string): string {
  const s = v.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  return dot < 0 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
}

// For <input type="number">: browsers let e, E, + and - through (they're
// valid in scientific notation). Blocks them, and the decimal point too
// for whole numbers.
export function blockNonNumericKeys(e: React.KeyboardEvent<HTMLInputElement>, allowDecimal = true): void {
  if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-' || (!allowDecimal && e.key === '.')) e.preventDefault();
}
