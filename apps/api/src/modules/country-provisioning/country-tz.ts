// F-S4.1-d — country code → IANA timezone resolver for Plausible site
// creation. Plausible needs a timezone at site-create time so dashboard
// dates render in the operator's local frame.
//
// Coverage: the 4 CA countries we operate in today + a generic UTC
// fallback for anything else (operator can edit in Plausible admin).
// When countries.tz lands as queryable metadata (F-S4.5 country profile),
// the provisioning step should prefer THAT value over this static map.

const COUNTRY_TIMEZONES: Record<string, string> = {
  uz: 'Asia/Tashkent',
  kz: 'Asia/Almaty',
  kg: 'Asia/Bishkek',
  tj: 'Asia/Dushanbe',
  tm: 'Asia/Ashgabat',
  af: 'Asia/Kabul',
};

export function tzForCountry(code: string): string {
  return COUNTRY_TIMEZONES[code.trim().toLowerCase()] ?? 'UTC';
}
