export interface GameSettings {
  requiredStableDuration: number; // in seconds
  velocityThreshold: number;      // velocity float to count as stable
  deathYCoordinate: number;        // bottom boundary height
  gravityY: number;                // gravity strength
  stoneWidth: number;              // width of the spawned stone
  stoneHeight: number;             // height of the spawned stone
  friction: number;                // PhysicsMaterial2D friction
  restitution: number;             // PhysicsMaterial2D bounciness
  mass: number;                    // Rigidbody2D mass
  aimAssist: boolean;              // indicator lines or helper HUD
}

export interface SimLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export type UnityScriptTab = 'GameManager' | 'Stone' | 'StoneSpawner' | 'UnityInstructions';
