import prisma from '../config/database';

/**
 * Fetch a single setting from the database by its key.
 * @param key The setting key (e.g., 'ignore_stock_limits')
 * @param defaultValue Fallback value if setting is not found
 */
export async function getSetting(key: string, defaultValue = ''): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? defaultValue;
}

/**
 * Fetch a boolean setting from the database by its key.
 * Returns true only if the setting value is explicitly the string "true".
 * @param key The setting key
 * @param defaultValue Fallback boolean value if setting is not found
 */
export async function getSettingBool(key: string, defaultValue = false): Promise<boolean> {
  const value = await getSetting(key);
  if (!value) return defaultValue;
  return value === 'true';
}
