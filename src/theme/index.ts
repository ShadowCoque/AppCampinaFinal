import { Platform, TextStyle, ViewStyle } from "react-native";

/**
 * Paleta tomada directamente del logo institucional vigente
 * (Club La Campiña - Country Club).
 */
export const colors = {
  /** Azul institucional del isotipo y del logotipo. */
  navy: "#08407D",
  navyDark: "#052C58",
  navyLight: "#1B5A9E",
  /** Azul celeste del ala intermedia. */
  sky: "#0071BD",
  skySoft: "#E8F1FA",
  /** Dorado del ala superior y de la línea "COUNTRY CLUB". */
  gold: "#D0A33E",
  goldSoft: "#FBF3E2",

  bg: "#F2F5F9",
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAFC",

  text: "#0F1F33",
  textMuted: "#5B7186",
  textFaint: "#8CA0B3",
  textOnDark: "#FFFFFF",

  border: "#DCE5EF",
  borderStrong: "#C2D2E3",

  success: "#0F7B4F",
  successSoft: "#E4F5EC",
  warning: "#9A6A00",
  warningSoft: "#FFF6E0",
  danger: "#B3261E",
  dangerSoft: "#FCEBEA",
  info: "#0071BD",
  infoSoft: "#E8F1FA",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const shadow: Record<"card" | "raised" | "sticky", ViewStyle> = {
  card: Platform.select({
    ios: {
      shadowColor: "#0B2545",
      shadowOpacity: 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 2 },
    default: {},
  }) as ViewStyle,
  raised: Platform.select({
    ios: {
      shadowColor: "#0B2545",
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 6 },
    default: {},
  }) as ViewStyle,
  sticky: Platform.select({
    ios: {
      shadowColor: "#0B2545",
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: -4 },
    },
    android: { elevation: 12 },
    default: {},
  }) as ViewStyle,
};

export const typography: Record<
  "display" | "title" | "sectionTitle" | "cardTitle" | "body" | "label" | "caption" | "overline",
  TextStyle
> = {
  display: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.navy },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  body: { fontSize: 15, fontWeight: "400", color: colors.text, lineHeight: 22 },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  caption: { fontSize: 12.5, fontWeight: "400", color: colors.textMuted, lineHeight: 18 },
  overline: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
};

/** Altura mínima táctil recomendada (accesibilidad). */
export const HIT_SIZE = 44;

export const theme = { colors, spacing, radius, shadow, typography, HIT_SIZE };

export type Theme = typeof theme;
