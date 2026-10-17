export type Quality = 'low' | 'medium' | 'high';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  quality: Quality;
  /** Pystysuuntainen näkökenttä asteina. */
  fov: number;
  /** Silmien väli millimetreinä (stereokuva). */
  eyeSeparation: number;
  /** Kääntyminen L/R-napeilla asteina. */
  turnAngle: number;
  /** Liikkumisnopeus prosentteina. */
  moveSpeed: number;
  difficulty: Difficulty;
}

const STORAGE_KEY = 'piilohippa.settings.v1';

export function defaultSettings(vr: boolean): Settings {
  return {
    quality: vr ? 'medium' : 'high',
    fov: vr ? 85 : 70,
    eyeSeparation: 63,
    turnAngle: 30,
    moveSpeed: 100,
    difficulty: 'normal',
  };
}

export function loadSettings(vr: boolean): Settings {
  const defaults = defaultSettings(vr);
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${vr ? 'vr' : 'flat'}`);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // Tallennus ei käytettävissä (esim. yksityinen selaus) – käytetään oletuksia.
  }
  return defaults;
}

export function saveSettings(vr: boolean, s: Settings): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}.${vr ? 'vr' : 'flat'}`, JSON.stringify(s));
  } catch {
    // ei haittaa
  }
}

export const QUALITY_LABELS: Record<Quality, string> = { low: 'Matala', medium: 'Keskitaso', high: 'Korkea' };
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Helppo', normal: 'Normaali', hard: 'Vaikea' };
