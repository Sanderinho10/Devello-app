import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Nettleserutgaven av sesjonslageret. Bare til forhåndsvisning under
 * utvikling (npm run web) — SecureStore finnes ikke i nettleseren. Appen
 * som gis ut er iOS og Android, og bruker sesjonslager.ts.
 */
export const sesjonslager = {
  getItem: (nokkel: string) => AsyncStorage.getItem(nokkel),
  setItem: (nokkel: string, verdi: string) => AsyncStorage.setItem(nokkel, verdi),
  removeItem: (nokkel: string) => AsyncStorage.removeItem(nokkel),
};
