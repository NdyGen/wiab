/**
 * Room Type Templates for WIAB Virtual Occupancy Sensors
 *
 * This module defines pre-configured timer templates for common room types.
 * Templates provide sensible defaults based on typical room usage patterns,
 * reducing the need for manual timer configuration trial-and-error.
 *
 * Template selection pre-fills timer values but does NOT store the template name.
 * Users can manually adjust values after template application.
 *
 * Specification: GitHub Issue #59
 */

/**
 * Timer configuration values for a room template.
 *
 * All timer values use the same units as device settings:
 * - t_enter: seconds
 * - t_clear: seconds
 * - stalePirMinutes: minutes
 * - staleDoorMinutes: minutes
 */
export interface TimerValues {
  /** Door motion window in seconds (how long to wait for motion after door event) */
  t_enter: number;

  /** Empty timeout in seconds (how long with no motion before marking room empty) */
  t_clear: number;

  /** PIR stale timeout in minutes (ignore PIR sensors stuck active longer than this) */
  stalePirMinutes: number;

  /** Door stale timeout in minutes (ignore door sensors stuck open longer than this) */
  staleDoorMinutes: number;
}

/**
 * Multilingual text content for a room template.
 *
 * Supports the same languages as WIAB:
 * - en: English
 * - nl: Dutch (Nederlands)
 * - de: German (Deutsch)
 * - no: Norwegian (Norsk)
 * - sv: Swedish (Svenska)
 */
export interface LocalizedText {
  en: string;
  nl: string;
  de: string;
  no: string;
  sv: string;
}

/**
 * Complete room type template definition.
 *
 * Each template represents optimal timer settings for a specific room type,
 * based on typical occupancy patterns and sensor behavior.
 */
export interface RoomTemplate {
  /** Unique identifier for the template (used in settings/pairing) */
  id: string;

  /** Localized display name for the room type */
  name: LocalizedText;

  /** Localized description explaining the template's use case */
  description: LocalizedText;

  /** Pre-configured timer values for this room type */
  timerValues: TimerValues;
}

/**
 * All available room type templates.
 *
 * Templates are defined with exact values from GitHub Issue #59.
 * These values represent optimal settings based on real-world usage patterns.
 *
 * Template categories:
 * - Long occupancy: Bedroom (sleeping, reading in bed)
 * - Short visits: Bathroom, Hallway, Storage (quick in-and-out)
 * - Work spaces: Home Office (minimal desk movement)
 * - Activity spaces: Kitchen, Living Room (intermittent motion)
 */
export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  {
    id: 'bedroom',
    name: {
      en: 'Bedroom',
      nl: 'Slaapkamer',
      de: 'Schlafzimmer',
      no: 'Soverom',
      sv: 'Sovrum',
    },
    description: {
      en: 'Long occupancy periods with minimal motion (sleeping, reading in bed)',
      nl: 'Lange bezettingsperioden met minimale beweging (slapen, lezen in bed)',
      de: 'Lange Belegungszeiten mit minimaler Bewegung (Schlafen, Lesen im Bett)',
      no: 'Lange opptaksperioder med minimal bevegelse (sove, lese i sengen)',
      sv: 'Långa närvarotider med minimal rörelse (sova, läsa i sängen)',
    },
    timerValues: {
      t_enter: 30,
      t_clear: 1200, // 20 minutes
      stalePirMinutes: 60,
      staleDoorMinutes: 60,
    },
  },
  {
    id: 'bathroom',
    name: {
      en: 'Bathroom',
      nl: 'Badkamer',
      de: 'Badezimmer',
      no: 'Baderom',
      sv: 'Badrum',
    },
    description: {
      en: 'Quick entry/exit, short occupancy (shower steam may affect sensors)',
      nl: 'Snelle binnenkomst/vertrek, korte bezetting (douchestoom kan sensoren beïnvloeden)',
      de: 'Schneller Ein-/Ausgang, kurze Belegung (Dampf kann Sensoren beeinflussen)',
      no: 'Rask inngang/utgang, kort opptak (dusjdamp kan påvirke sensorer)',
      sv: 'Snabb in-/utgång, kort närvaro (duschånga kan påverka sensorer)',
    },
    timerValues: {
      t_enter: 10,
      t_clear: 300, // 5 minutes
      stalePirMinutes: 15,
      staleDoorMinutes: 15,
    },
  },
  {
    id: 'home_office',
    name: {
      en: 'Home Office',
      nl: 'Thuiskantoor',
      de: 'Heimbüro',
      no: 'Hjemmekontor',
      sv: 'Hemmakontor',
    },
    description: {
      en: 'Minimal desk movement, focused work periods',
      nl: 'Minimale bureaubeweging, gefocuste werkperiodes',
      de: 'Minimale Schreibtischbewegung, fokussierte Arbeitszeiten',
      no: 'Minimal skrivebordsbevegelse, fokuserte arbeidsperioder',
      sv: 'Minimal skrivbordsrörelse, fokuserade arbetsperioder',
    },
    timerValues: {
      t_enter: 15,
      t_clear: 900, // 15 minutes
      stalePirMinutes: 30,
      staleDoorMinutes: 30,
    },
  },
  {
    id: 'kitchen',
    name: {
      en: 'Kitchen',
      nl: 'Keuken',
      de: 'Küche',
      no: 'Kjøkken',
      sv: 'Kök',
    },
    description: {
      en: 'Cooking activities with intermittent motion',
      nl: 'Kookactiviteiten met periodieke beweging',
      de: 'Kochaktivitäten mit intermittierender Bewegung',
      no: 'Matlaging med periodisk bevegelse',
      sv: 'Matlagning med intermittent rörelse',
    },
    timerValues: {
      t_enter: 15,
      t_clear: 600, // 10 minutes
      stalePirMinutes: 30,
      staleDoorMinutes: 30,
    },
  },
  {
    id: 'living_room',
    name: {
      en: 'Living Room',
      nl: 'Woonkamer',
      de: 'Wohnzimmer',
      no: 'Stue',
      sv: 'Vardagsrum',
    },
    description: {
      en: 'Watching TV or relaxing with minimal motion',
      nl: 'TV kijken of ontspannen met minimale beweging',
      de: 'Fernsehen oder Entspannen mit minimaler Bewegung',
      no: 'Se TV eller slappe av med minimal bevegelse',
      sv: 'Titta på TV eller koppla av med minimal rörelse',
    },
    timerValues: {
      t_enter: 20,
      t_clear: 900, // 15 minutes
      stalePirMinutes: 30,
      staleDoorMinutes: 30,
    },
  },
  {
    id: 'hallway',
    name: {
      en: 'Hallway / Corridor',
      nl: 'Gang / Corridor',
      de: 'Flur / Korridor',
      no: 'Gang / Korridor',
      sv: 'Hall / Korridor',
    },
    description: {
      en: 'Passing through only, very short occupancy',
      nl: 'Alleen doorgang, zeer korte bezetting',
      de: 'Nur Durchgang, sehr kurze Belegung',
      no: 'Bare gjennomgang, svært kort opptak',
      sv: 'Endast genomgång, mycket kort närvaro',
    },
    timerValues: {
      t_enter: 5,
      t_clear: 60, // 1 minute
      stalePirMinutes: 15,
      staleDoorMinutes: 15,
    },
  },
  {
    id: 'storage',
    name: {
      en: 'Storage / Garage',
      nl: 'Opslag / Garage',
      de: 'Lagerraum / Garage',
      no: 'Lager / Garasje',
      sv: 'Förråd / Garage',
    },
    description: {
      en: 'Grab items and leave, short visits',
      nl: 'Spullen pakken en vertrekken, korte bezoeken',
      de: 'Gegenstände holen und gehen, kurze Besuche',
      no: 'Hente ting og gå, korte besøk',
      sv: 'Hämta saker och gå, korta besök',
    },
    timerValues: {
      t_enter: 10,
      t_clear: 180, // 3 minutes
      stalePirMinutes: 30,
      staleDoorMinutes: 30,
    },
  },
] as const;

/**
 * Retrieves a room template by its unique identifier.
 *
 * @param id - The template ID to look up (e.g., 'bedroom', 'kitchen')
 * @returns The matching template, or undefined if not found
 *
 * @example
 * ```typescript
 * const bedroom = getTemplateById('bedroom');
 * if (bedroom) {
 *   console.log(bedroom.timerValues.t_enter); // 30
 * }
 * ```
 */
export function getTemplateById(id: string): RoomTemplate | undefined {
  return ROOM_TEMPLATES.find((template) => template.id === id);
}

/**
 * Retrieves only the timer values for a room template.
 *
 * This is a convenience function for when you only need the timer configuration,
 * not the full template metadata (name, description, etc.).
 *
 * @param id - The template ID to look up
 * @returns The timer values, or undefined if template not found
 *
 * @example
 * ```typescript
 * const timers = getTemplateTimers('bathroom');
 * if (timers) {
 *   await device.setSettings({
 *     t_enter: timers.t_enter,
 *     t_clear: timers.t_clear,
 *     stalePirMinutes: timers.stalePirMinutes,
 *     staleDoorMinutes: timers.staleDoorMinutes,
 *   });
 * }
 * ```
 */
export function getTemplateTimers(id: string): TimerValues | undefined {
  const template = getTemplateById(id);
  return template?.timerValues;
}

/**
 * Returns all available room templates.
 *
 * Useful for populating UI dropdowns or generating documentation.
 *
 * @returns Array of all room templates
 *
 * @example
 * ```typescript
 * const templates = getAllTemplates();
 * templates.forEach(template => {
 *   console.log(`${template.id}: ${template.name.en}`);
 * });
 * ```
 */
export function getAllTemplates(): readonly RoomTemplate[] {
  return ROOM_TEMPLATES;
}
