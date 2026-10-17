import type * as THREE from 'three';
import type { World } from './physics';
import type { Player } from './player';
import type { Quality } from './settings';

export type Role = 'seeker' | 'hider';

export interface GameScene {
  readonly scene: THREE.Scene;
  readonly world: World;
  readonly spawn: { x: number; y: number; z: number; yaw: number };
  update(dt: number, player: Player): void;
  applyQuality(q: Quality): void;
  dispose(): void;
}
