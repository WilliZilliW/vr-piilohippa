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
  /** Äänenvoimakkuus prosentteina. */
  volume: number;
}

const STORAGE_KEY = 'piilohippa.settings.v1';

/** Pelitapa: VR-lasit, tietokone (testi) tai kännykkä kosketusohjauksella. */
export type Mode = 'vr' | 'flat' | 'touch';

export function defaultSettings(mode: Mode): Settings {
  return {
    quality: mode === 'flat' ? 'high' : 'medium',
    fov: mode === 'vr' ? 85 : 70,
    eyeSeparation: 63,
    turnAngle: 30,
    moveSpeed: 100,
    difficulty: 'normal',
    volume: 80,
  };
}

export function loadSettings(mode: Mode): Settings {
  const defaults = defaultSettings(mode);
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${mode}`);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // Tallennus ei käytettävissä (esim. yksityinen selaus) – käytetään oletuksia.
  }
  return defaults;
}

export function saveSettings(mode: Mode, s: Settings): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}.${mode}`, JSON.stringify(s));
  } catch {
    // ei haittaa
  }
}

export const QUALITY_LABELS: Record<Quality, string> = { low: 'Matala', medium: 'Keskitaso', high: 'Korkea' };
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Helppo', normal: 'Normaali', hard: 'Vaikea' };
