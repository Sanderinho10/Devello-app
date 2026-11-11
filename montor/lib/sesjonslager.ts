import AsyncStorage from "@react-native-async-storage/async-storage";
import * as aesjs from "aes-js";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * Lageret Supabase legger sesjonen i — «LargeSecureStore»-mønsteret fra
 * Supabase sin Expo-guide. SecureStore har en grense på 2 KB per nøkkel og
 * tokenene er større: verdien krypteres med AES-256-CTR og legges i
 * AsyncStorage, mens nøkkelen (32 byte) ligger i SecureStore. Ingenting
 * leselig utenfor Keychain/Keystore.
 *
 * sesjonslager.web.ts er nettleserutgaven, bare til forhåndsvisning.
 */
class LargeSecureStore {
  private async krypter(nokkel: string, verdi: string): Promise<string> {
    const aesNokkel = Crypto.getRandomBytes(32);
    const cipher = new aesjs.ModeOfOperation.ctr(aesNokkel, new aesjs.Counter(1));
    const kryptert = cipher.encrypt(aesjs.utils.utf8.toBytes(verdi));
    await SecureStore.setItemAsync(nokkel, aesjs.utils.hex.fromBytes(aesNokkel), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return aesjs.utils.hex.fromBytes(kryptert);
  }

  private async dekrypter(nokkel: string, verdi: string): Promise<string | null> {
    const hex = await SecureStore.getItemAsync(nokkel);
    if (!hex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(verdi)));
  }

  async getItem(nokkel: string): Promise<string | null> {
    const kryptert = await AsyncStorage.getItem(nokkel);
    if (!kryptert) return null;
    try {
      return await this.dekrypter(nokkel, kryptert);
    } catch {
      // Nøkkelen er borte (ny installasjon over gammel data) — sesjonen er tapt, logg inn på nytt.
      await this.removeItem(nokkel);
      return null;
    }
  }

  async setItem(nokkel: string, verdi: string): Promise<void> {
    const kryptert = await this.krypter(nokkel, verdi);
    await AsyncStorage.setItem(nokkel, kryptert);
  }

  async removeItem(nokkel: string): Promise<void> {
    await AsyncStorage.removeItem(nokkel);
    await SecureStore.deleteItemAsync(nokkel);
  }
}

export const sesjonslager = new LargeSecureStore();
