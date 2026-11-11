import { LogBox } from "react-native";

/**
 * expo-notifications sier fra i Expo Go at push ikke er fullt støttet der.
 * Det vet vi (se README): på iPhone virker push i Expo Go, på Android
 * trengs en egen build, og koden tåler begge. Meldingen skal ikke ligge
 * over fanelinja hver gang appen starter. Må importeres før expo-notifications.
 */
LogBox.ignoreLogs(["`expo-notifications` functionality is not fully supported in Expo Go", "expo-notifications: Android Push notifications"]);
