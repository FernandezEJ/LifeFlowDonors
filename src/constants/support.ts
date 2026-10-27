// Public contact only. Set in the mobile .env / EAS environment; never put secrets here.
export function supportEmail(value: unknown = process.env.EXPO_PUBLIC_LIFEFLOW_SUPPORT_EMAIL): string | null {
  if (typeof value !== 'string') return null;
  const address = value.trim();
  return address.length <= 254 && /^[a-zA-Z0-9][a-zA-Z0-9._+-]*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(address) ? address : null;
}
