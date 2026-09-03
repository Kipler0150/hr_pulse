export const PRIVACY_NOTICE_MANIFEST = Object.freeze({
  version: "2026-09-03-v1",
  effectiveDate: "September 3, 2026",
  privacy: Object.freeze({
    title: "Privacy notice",
    file: "privacy-v1.md",
  }),
  terms: Object.freeze({
    title: "Terms of use",
    file: "terms-v1.md",
  }),
});

export function getPrivacyNotice(type) {
  if (type !== "privacy" && type !== "terms") throw new Error("Unknown privacy notice");
  return { type, ...PRIVACY_NOTICE_MANIFEST[type], version: PRIVACY_NOTICE_MANIFEST.version, effectiveDate: PRIVACY_NOTICE_MANIFEST.effectiveDate };
}
