import * as Crypto from 'expo-crypto';

/** Stable 64-bit FNV-1a hash as hex. Used for deterministic album/artist ids. */
export function stableId(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function newId(): string {
  return Crypto.randomUUID();
}

export function normalizeName(value: string | undefined | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
