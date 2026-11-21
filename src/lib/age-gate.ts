/**
 * Product-level 18+ acknowledgement.
 * This records the user's explicit declaration; it is not identity verification
 * and does not replace legal review of age-assurance requirements.
 */
export const AGE_GATE_VERSION = '2026-11'

export function hasAcceptedAdultTerms(value: unknown): value is true {
  return value === true
}