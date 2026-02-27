import "./styles.css";

type MolePhase = "pop" | "idle" | "hit" | "retreat";
type MoleType = "normal" | "gold" | "bomb" | "ice";

interface Sprite {
  image: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

interface LevelConfig {
  grid: number;
  concurrentMin: number;
  concurrentMax: number;
  spawnIntervalMs: number;
  holdMinMs: number;
  holdMaxMs: number;
}

interface Assets {
  bg: HTMLImageElement;
  hole: Sprite;
  pop: Sprite;
  idle: Sprite;
  hit: Sprite;
  retreat: Sprite;
}

interface GameProfile {
  bestScore: number;
  bestCombo: number;
  totalPlays: number;
  totalHits: number;
  totalMisses: number;
  coins: number;
  soundEnabled: boolean;
}

interface BoardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Cell {
  index: number;
  row: number;
  col: number;
  cx: number;
  cy: number;
  holeWidth: number;
  holeHeight: number;
  moleWidth: number;
  moleHeight: number;
}

interface ActiveMole {
  id: number;
  cellIndex: number;
  type: MoleType;
  phase: MolePhase;
  phaseElapsedMs: number;
  spawnedAtMs: number;
  popDurationMs: number;
  idleDurationMs: number;
  hitDurationMs: number;
  retreatDurationMs: number;
  wasHit: boolean;
  appearanceSprite: Sprite | null;
}

interface IntervalStats {
  hits: number;
  misses: number;
  reactionTotalMs: number;
  reactionCount: number;
}

interface MatchSummary {
  score: number;
  bestCombo: number;
  survivalSec: number;
  baseCoins: number;
  rewardCoins: number;
}

interface MoleDrawMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  visibility: number;
  clipBottomY: number;
}

type PromotionState = "none" | "pending" | "grace";

interface DifficultyProfile {
  grid: number;
  spawnIntervalMs: number;
  holdMinMs: number;
  holdMaxMs: number;
  concurrentMin: number;
  concurrentMax: number;
}

const START_TIME_MS = 45_000;
const MAX_TIME_MS = 120_000;
const CHECKPOINT_MS = 5_000;
const CELL_COOLDOWN_MS = 900;
const PROMOTION_PENDING_MS = 1_500;
const STAGE1_PROMOTION_PENDING_MS = 1_200;
const PROMOTION_GRACE_BASE_MS = 3_000;
const STAGE_TRANSITION_NOTICE_MS = 1_800;
const STAGE_START_TIME_MS: Partial<Record<number, number>> = {
  2: 45_000,
  3: 43_000,
  4: 41_000,
  5: 39_000,
  6: 37_000,
  7: 35_000
};
const LEVEL_ENTRY_EASE_MS: Partial<Record<number, number>> = {
  2: 14_000,
  3: 10_000,
  4: 8_000,
  5: 7_000,
  6: 6_000,
  7: 5_000
};
const PROMOTION_GRACE_MS_BY_LEVEL: Partial<Record<number, number>> = {
  2: 8_000,
  3: 5_000
};
const STORAGE_KEY = "dothegi.profile.v2";
const REWARD_BONUS_COINS = 20;
const MOLE_ANCHOR_Y_FACTOR = -0.08;
const HOLE_FRONT_COVER_START = 0.32;
const MOLE_BOTTOM_CLIP_Y_FACTOR = 0.08;
const MOLE_SIZE_FACTOR = 0.64;
const MOLE_CLIP_RECT_WIDTH_FACTOR = 0.72;
const MOLE_CLIP_CURVE_HALF_WIDTH_FACTOR = 0.56;
const MOLE_CLIP_CURVE_EDGE_OFFSET_FACTOR = 0.14;
const MOLE_CLIP_CURVE_DIP_OFFSET_FACTOR = 0.18;
const MAX_CUSTOM_CHARACTER_COUNT = 6;
const MAX_CUSTOM_IMAGE_BYTES = 6 * 1024 * 1024;

const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1: { grid: 3, concurrentMin: 1, concurrentMax: 1, spawnIntervalMs: 980, holdMinMs: 1200, holdMaxMs: 1450 },
  2: { grid: 4, concurrentMin: 1, concurrentMax: 2, spawnIntervalMs: 820, holdMinMs: 930, holdMaxMs: 1080 },
  3: { grid: 5, concurrentMin: 1, concurrentMax: 2, spawnIntervalMs: 760, holdMinMs: 860, holdMaxMs: 980 },
  4: { grid: 6, concurrentMin: 2, concurrentMax: 2, spawnIntervalMs: 700, holdMinMs: 780, holdMaxMs: 900 },
  5: { grid: 7, concurrentMin: 2, concurrentMax: 3, spawnIntervalMs: 640, holdMinMs: 720, holdMaxMs: 820 },
  6: { grid: 8, concurrentMin: 2, concurrentMax: 3, spawnIntervalMs: 580, holdMinMs: 660, holdMaxMs: 760 },
  7: { grid: 9, concurrentMin: 3, concurrentMax: 3, spawnIntervalMs: 520, holdMinMs: 620, holdMaxMs: 700 }
};

const MIN_HITS_TO_LEVEL_UP: Record<number, number> = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
  7: Number.MAX_SAFE_INTEGER
};

const defaultProfile: GameProfile = {
  bestScore: 0,
  bestCombo: 0,
  totalPlays: 0,
  totalHits: 0,
  totalMisses: 0,
  coins: 0,
  soundEnabled: true
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number): number {
  const ratio = clamp(t, 0, 1);
  return from + (to - from) * ratio;
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    img.src = src;
  });
}

function assetPath(filename: string): string {
  return `${import.meta.env.BASE_URL}assets/${filename}`;
}

function createTrimmedSprite(image: HTMLImageElement): Sprite {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { image, sx: 0, sy: 0, sw: width, sh: height };
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  const alpha = context.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const alphaThreshold = 8;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const a = alpha[rowOffset + x * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { image, sx: 0, sy: 0, sw: width, sh: height };
  }

  return {
    image,
    sx: minX,
    sy: minY,
    sw: maxX - minX + 1,
    sh: maxY - minY + 1
  };
}

function pickWeightedType(weights: Array<[MoleType, number]>): MoleType {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [type, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      return type;
    }
  }
  return weights[weights.length - 1][0];
}

interface ToneSpec {
  freq: number;
  durationMs: number;
  offsetMs?: number;
  gain?: number;
  type?: OscillatorType;
  endFreq?: number;
}

const SFX_MASTER_GAIN = 0.62;
const BGM_LOOP_INTERVAL_MS = 2600;
const BGM_MIN_TEMPO = 1;
const BGM_MAX_TEMPO = 1.48;
const BGM_LOOP_PATTERNS: ToneSpec[][] = [
  [
    { freq: 392, durationMs: 220, offsetMs: 0, gain: 0.03, type: "triangle" },
    { freq: 494, durationMs: 220, offsetMs: 260, gain: 0.032, type: "triangle" },
    { freq: 523, durationMs: 220, offsetMs: 520, gain: 0.03, type: "triangle" },
    { freq: 587, durationMs: 220, offsetMs: 780, gain: 0.032, type: "triangle" },
    { freq: 523, durationMs: 220, offsetMs: 1040, gain: 0.03, type: "triangle" },
    { freq: 494, durationMs: 220, offsetMs: 1300, gain: 0.03, type: "triangle" },
    { freq: 440, durationMs: 220, offsetMs: 1560, gain: 0.028, type: "triangle" },
    { freq: 392, durationMs: 240, offsetMs: 1820, gain: 0.03, type: "triangle" },
    { freq: 330, durationMs: 240, offsetMs: 2080, gain: 0.026, type: "triangle" }
  ],
  [
    { freq: 392, durationMs: 210, offsetMs: 0, gain: 0.029, type: "triangle" },
    { freq: 440, durationMs: 210, offsetMs: 240, gain: 0.03, type: "triangle" },
    { freq: 494, durationMs: 210, offsetMs: 480, gain: 0.031, type: "triangle" },
    { freq: 523, durationMs: 210, offsetMs: 720, gain: 0.031, type: "triangle" },
    { freq: 587, durationMs: 210, offsetMs: 960, gain: 0.032, type: "triangle" },
    { freq: 659, durationMs: 200, offsetMs: 1200, gain: 0.031, type: "triangle" },
    { freq: 587, durationMs: 210, offsetMs: 1440, gain: 0.03, type: "triangle" },
    { freq: 523, durationMs: 210, offsetMs: 1680, gain: 0.029, type: "triangle" },
    { freq: 440, durationMs: 240, offsetMs: 1940, gain: 0.027, type: "triangle" }
  ],
  [
    { freq: 392, durationMs: 210, offsetMs: 0, gain: 0.029, type: "triangle" },
    { freq: 523, durationMs: 180, offsetMs: 200, gain: 0.028, type: "triangle" },
    { freq: 494, durationMs: 210, offsetMs: 470, gain: 0.031, type: "triangle" },
    { freq: 587, durationMs: 190, offsetMs: 700, gain: 0.03, type: "triangle" },
    { freq: 523, durationMs: 210, offsetMs: 930, gain: 0.03, type: "triangle" },
    { freq: 659, durationMs: 190, offsetMs: 1170, gain: 0.031, type: "triangle" },
    { freq: 587, durationMs: 210, offsetMs: 1420, gain: 0.03, type: "triangle" },
    { freq: 494, durationMs: 210, offsetMs: 1680, gain: 0.029, type: "triangle" },
    { freq: 392, durationMs: 250, offsetMs: 1960, gain: 0.027, type: "triangle" }
  ]
];

type AudioContextCtor = new () => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const maybeWindow = window as Window & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return maybeWindow.AudioContext ?? maybeWindow.webkitAudioContext ?? null;
}

class SfxEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean;
  private bgmTimerId: number | null = null;
  private bgmTempo = BGM_MIN_TEMPO;
  private bgmPatternIndex = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopBgm();
    }
  }

  setBgmTempo(tempo: number): void {
    this.bgmTempo = clamp(tempo, BGM_MIN_TEMPO, BGM_MAX_TEMPO);
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // 사용자 제스처 외 상황에서는 resume이 실패할 수 있다.
      }
    }
  }

  dispose(): void {
    this.stopBgm();
    const ctx = this.audioContext;
    this.audioContext = null;
    this.masterGain = null;
    if (!ctx) {
      return;
    }
    void ctx.close().catch(() => {
      // 이미 닫힌 컨텍스트면 무시
    });
  }

  playStart(): void {
    this.play([
      { freq: 420, durationMs: 80, gain: 0.09, type: "triangle" },
      { freq: 640, durationMs: 120, offsetMs: 80, gain: 0.1, type: "triangle" }
    ]);
  }

  playPause(): void {
    this.play([{ freq: 260, durationMs: 120, gain: 0.08, type: "square" }]);
  }

  playResume(): void {
    this.play([{ freq: 360, durationMs: 90, gain: 0.08, type: "triangle" }]);
  }

  playToggle(enabled: boolean): void {
    if (!enabled) {
      return;
    }
    this.play([{ freq: 520, durationMs: 70, gain: 0.08, type: "triangle" }]);
  }

  playHitNormal(): void {
    this.play([{ freq: 760, durationMs: 70, gain: 0.08, type: "square" }]);
  }

  playHitGold(): void {
    this.play([
      { freq: 860, durationMs: 70, gain: 0.08, type: "triangle" },
      { freq: 1240, durationMs: 90, offsetMs: 70, gain: 0.09, type: "triangle" }
    ]);
  }

  playHitBomb(): void {
    this.play([
      { freq: 220, endFreq: 110, durationMs: 220, gain: 0.1, type: "sawtooth" },
      { freq: 160, endFreq: 90, durationMs: 260, offsetMs: 40, gain: 0.09, type: "square" }
    ]);
  }

  playHitIce(): void {
    this.play([
      { freq: 680, durationMs: 80, gain: 0.08, type: "sine" },
      { freq: 500, durationMs: 130, offsetMs: 65, gain: 0.07, type: "sine" }
    ]);
  }

  playMiss(): void {
    this.play([{ freq: 220, durationMs: 80, gain: 0.07, type: "triangle" }]);
  }

  playLevelUp(): void {
    this.play([
      { freq: 520, durationMs: 80, gain: 0.08, type: "triangle" },
      { freq: 780, durationMs: 90, offsetMs: 80, gain: 0.09, type: "triangle" }
    ]);
  }

  playLevelDown(): void {
    this.play([
      { freq: 520, durationMs: 80, gain: 0.08, type: "triangle" },
      { freq: 340, durationMs: 90, offsetMs: 80, gain: 0.08, type: "triangle" }
    ]);
  }

  playReward(): void {
    this.play([
      { freq: 640, durationMs: 80, gain: 0.08, type: "triangle" },
      { freq: 880, durationMs: 90, offsetMs: 70, gain: 0.09, type: "triangle" },
      { freq: 1180, durationMs: 130, offsetMs: 140, gain: 0.1, type: "triangle" }
    ]);
  }

  playGameOver(): void {
    this.play([
      { freq: 320, durationMs: 140, gain: 0.08, type: "sawtooth" },
      { freq: 220, durationMs: 170, offsetMs: 110, gain: 0.08, type: "sawtooth" }
    ]);
  }

  startBgm(): void {
    if (!this.enabled || this.bgmTimerId !== null) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) {
      return;
    }
    if (ctx.state !== "running") {
      if (ctx.state === "suspended") {
        void ctx.resume().then(() => this.startBgm()).catch(() => {
          // 자동 재생 정책으로 재개 실패 가능
        });
      }
      return;
    }

    this.bgmPatternIndex = 0;
    this.scheduleBgmLoop();
  }

  pauseBgm(): void {
    this.stopBgm();
  }

  resumeBgm(): void {
    this.startBgm();
  }

  stopBgm(): void {
    if (this.bgmTimerId !== null) {
      window.clearTimeout(this.bgmTimerId);
      this.bgmTimerId = null;
    }
  }

  private scheduleBgmLoop(): void {
    if (!this.enabled) {
      this.stopBgm();
      return;
    }
    const tempo = clamp(this.bgmTempo, BGM_MIN_TEMPO, BGM_MAX_TEMPO);
    const pattern = BGM_LOOP_PATTERNS[this.bgmPatternIndex % BGM_LOOP_PATTERNS.length];
    const sequence = this.buildBgmSequence(pattern, tempo, this.bgmPatternIndex);
    this.play(sequence);
    this.bgmPatternIndex += 1;

    const swing = this.bgmPatternIndex % 2 === 0 ? 1 : 0.97;
    const nextDelay = Math.max(900, Math.round((BGM_LOOP_INTERVAL_MS / tempo) * swing));
    this.bgmTimerId = window.setTimeout(() => {
      this.bgmTimerId = null;
      this.scheduleBgmLoop();
    }, nextDelay);
  }

  private buildBgmSequence(pattern: ToneSpec[], tempo: number, loopIndex: number): ToneSpec[] {
    const safeTempo = clamp(tempo, BGM_MIN_TEMPO, BGM_MAX_TEMPO);
    const pitchRatio = loopIndex % 8 >= 6 ? 1.0293 : 1;
    const gainRatio = 0.96 + (loopIndex % 3) * 0.02;

    return pattern.map((tone) => ({
      ...tone,
      freq: tone.freq * pitchRatio,
      endFreq: tone.endFreq ? tone.endFreq * pitchRatio : undefined,
      durationMs: Math.max(70, tone.durationMs / safeTempo),
      offsetMs: (tone.offsetMs ?? 0) / safeTempo,
      gain: (tone.gain ?? 0.03) * gainRatio
    }));
  }

  private ensureContext(): AudioContext | null {
    if (this.audioContext) {
      return this.audioContext;
    }
    const AudioCtor = getAudioContextCtor();
    if (!AudioCtor) {
      return null;
    }
    const ctx = new AudioCtor();
    const master = ctx.createGain();
    master.gain.value = SFX_MASTER_GAIN;
    master.connect(ctx.destination);
    this.audioContext = ctx;
    this.masterGain = master;
    return this.audioContext;
  }

  private play(sequence: ToneSpec[]): void {
    if (!this.enabled) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) {
      return;
    }
    if (ctx.state !== "running") {
      if (ctx.state === "suspended") {
        void ctx.resume().then(() => this.play(sequence)).catch(() => {
          // 자동 재생 정책으로 재개 실패 가능
        });
      }
      return;
    }
    const startBase = ctx.currentTime;
    for (const tone of sequence) {
      const toneStart = startBase + (tone.offsetMs ?? 0) / 1000;
      const toneEnd = toneStart + tone.durationMs / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const peak = tone.gain ?? 0.09;
      const startFreq = Math.max(40, tone.freq);
      const endFreq = Math.max(40, tone.endFreq ?? startFreq);
      osc.type = tone.type ?? "triangle";
      osc.frequency.setValueAtTime(startFreq, toneStart);
      if (endFreq !== startFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, toneEnd);
      }

      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(peak, toneStart + Math.min(0.018, tone.durationMs / 1000));
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(toneStart);
      osc.stop(toneEnd + 0.025);
    }
  }
}

class WhackGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scoreValue: HTMLElement;
  private readonly timeValue: HTMLElement;
  private readonly levelValue: HTMLElement;
  private readonly comboValue: HTMLElement;
  private readonly bestValue: HTMLElement;
  private readonly coinsValue: HTMLElement;
  private readonly timeGaugeOverlay: HTMLElement;
  private readonly timeGaugeFill: HTMLElement;
  private readonly timeGaugeText: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly centerMessage: HTMLElement;
  private readonly hudOverlay: HTMLElement;
  private readonly controlOverlay: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly characterPickButton: HTMLButtonElement;
  private readonly characterResetButton: HTMLButtonElement;
  private readonly characterInput: HTMLInputElement;
  private readonly characterStatus: HTMLElement;
  private readonly characterPreviewList: HTMLElement;
  private readonly lobbySoundButton: HTMLButtonElement;
  private readonly lobbyModal: HTMLElement;
  private readonly lobbyStartButton: HTMLButtonElement;

  private readonly resultModal: HTMLElement;
  private readonly resultSummary: HTMLElement;
  private readonly resultSubSummary: HTMLElement;
  private readonly bragButton: HTMLButtonElement;
  private readonly rewardButton: HTMLButtonElement;
  private readonly replayButton: HTMLButtonElement;
  private readonly sfx: SfxEngine;

  private assets: Assets | null = null;
  private profile: GameProfile = { ...defaultProfile };
  private customCharacterSprites: Sprite[] = [];
  private customCharacterObjectUrls: string[] = [];
  private bragBackgroundImage: HTMLImageElement | null = null;

  private canvasWidth = 0;
  private canvasHeight = 0;
  private boardRect: BoardRect = { x: 0, y: 0, width: 0, height: 0 };
  private cells: Cell[] = [];

  private isRunning = false;
  private isPaused = false;
  private isGameOver = false;

  private rafId = 0;
  private lastFrameMs = 0;
  private elapsedMs = 0;
  private nextCheckpointAtMs = CHECKPOINT_MS;
  private nextSpawnAtMs = 300;
  private slowUntilMs = 0;

  private level = 1;
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private timeRemainingMs = START_TIME_MS;
  private timeGaugeCapMs = START_TIME_MS;
  private tierProgress = 0;
  private skillEMA = 0.5;
  private promotionState: PromotionState = "none";
  private promotionTargetLevel: number | null = null;
  private promotionElapsedMs = 0;
  private levelEaseFromLevel: number | null = null;
  private levelEaseElapsedMs = 0;
  private levelEaseDurationMs = 0;
  private stageTransitionLockMs = 0;
  private stageTransitionResumeText = "플레이 중";
  private stageFloorLevel = 1;
  private lowPiStreak = 0;

  private statusText = "준비";
  private activeMoles: ActiveMole[] = [];
  private recentCellIndices: number[] = [];
  private cellCooldownUntil: number[] = [];
  private moleSerial = 1;

  private intervalStats: IntervalStats = { hits: 0, misses: 0, reactionTotalMs: 0, reactionCount: 0 };
  private sessionHits = 0;
  private sessionMisses = 0;
  private rewardClaimed = false;
  private matchSummary: MatchSummary = { score: 0, bestCombo: 0, survivalSec: 0, baseCoins: 0, rewardCoins: 0 };

  constructor() {
    this.canvas = this.mustGetCanvas("gameCanvas");
    this.ctx = this.mustGetContext(this.canvas);
    this.scoreValue = this.mustGetElement("scoreValue");
    this.timeValue = this.mustGetElement("timeValue");
    this.levelValue = this.mustGetElement("levelValue");
    this.comboValue = this.mustGetElement("comboValue");
    this.bestValue = this.mustGetElement("bestValue");
    this.coinsValue = this.mustGetElement("coinsValue");
    this.timeGaugeOverlay = this.mustGetElement("timeGaugeOverlay");
    this.timeGaugeFill = this.mustGetElement("timeGaugeFill");
    this.timeGaugeText = this.mustGetElement("timeGaugeText");
    this.statusLine = this.mustGetElement("statusLine");
    this.centerMessage = this.mustGetElement("centerMessage");
    this.hudOverlay = this.mustGetElement("hudOverlay");
    this.controlOverlay = this.mustGetElement("controlOverlay");
    this.startButton = this.mustGetButton("startBtn");
    this.pauseButton = this.mustGetButton("pauseBtn");
    this.soundButton = this.mustGetButton("soundBtn");
    this.characterPickButton = this.mustGetButton("characterPickBtn");
    this.characterResetButton = this.mustGetButton("characterResetBtn");
    this.characterInput = this.mustGetInput("characterInput");
    this.characterStatus = this.mustGetElement("characterStatus");
    this.characterPreviewList = this.mustGetElement("characterPreviewList");
    this.lobbySoundButton = this.mustGetButton("lobbySoundBtn");
    this.lobbyModal = this.mustGetElement("lobbyModal");
    this.lobbyStartButton = this.mustGetButton("lobbyStartBtn");

    this.resultModal = this.mustGetElement("resultModal");
    this.resultSummary = this.mustGetElement("resultSummary");
    this.resultSubSummary = this.mustGetElement("resultSubSummary");
    this.bragButton = this.mustGetButton("bragBtn");
    this.rewardButton = this.mustGetButton("rewardBtn");
    this.replayButton = this.mustGetButton("replayBtn");

    this.profile = this.loadProfile();
    this.sfx = new SfxEngine(this.profile.soundEnabled);
    this.renderCharacterPreviews();
    this.updateSoundButtons();
    this.syncHud();
    this.syncViewportHeight();

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("orientationchange", this.handleResize);
    window.visualViewport?.addEventListener("resize", this.handleResize);
    window.visualViewport?.addEventListener("scroll", this.handleResize);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.startButton.addEventListener("click", this.handleStartClick);
    this.pauseButton.addEventListener("click", this.handlePauseClick);
    this.soundButton.addEventListener("click", this.handleSoundToggleClick);
    this.lobbySoundButton.addEventListener("click", this.handleSoundToggleClick);
    this.bragButton.addEventListener("click", this.handleBragClick);
    this.rewardButton.addEventListener("click", this.handleRewardClick);
    this.replayButton.addEventListener("click", this.handleReplayClick);
    this.characterPickButton.addEventListener("click", this.handleCharacterPickClick);
    this.characterResetButton.addEventListener("click", this.handleCharacterResetClick);
    this.characterInput.addEventListener("change", this.handleCharacterInputChange);
    this.lobbyStartButton.addEventListener("click", this.handleLobbyStartClick);
    window.addEventListener("beforeunload", this.handleBeforeUnload);

    this.lobbyStartButton.disabled = true;

    void this.init();
  }

  private mustGetElement(id: string): HTMLElement {
    const node = document.getElementById(id);
    if (!node) {
      throw new Error(`요소를 찾을 수 없습니다: #${id}`);
    }
    return node;
  }

  private mustGetButton(id: string): HTMLButtonElement {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error(`버튼을 찾을 수 없습니다: #${id}`);
    }
    return node;
  }

  private mustGetInput(id: string): HTMLInputElement {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLInputElement)) {
      throw new Error(`입력 요소를 찾을 수 없습니다: #${id}`);
    }
    return node;
  }

  private mustGetCanvas(id: string): HTMLCanvasElement {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error(`캔버스를 찾을 수 없습니다: #${id}`);
    }
    return node;
  }

  private mustGetContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context를 초기화하지 못했습니다.");
    }
    return context;
  }

  private readonly handleResize = (): void => {
    this.syncViewportHeight();
    this.resizeCanvas();
  };

  private syncViewportHeight(): void {
    const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
    if (viewportHeight <= 0) {
      return;
    }
    document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
  }

  private readonly handleStartClick = (): void => {
    if (!this.assets) {
      return;
    }
    void this.sfx.unlock();
    this.startGame();
  };

  private readonly handleReplayClick = (): void => {
    if (!this.assets) {
      return;
    }
    void this.sfx.unlock();
    this.startGame();
  };

  private readonly handleCharacterPickClick = (): void => {
    this.characterInput.click();
  };

  private readonly handleLobbyStartClick = (): void => {
    if (!this.assets) {
      return;
    }
    void this.sfx.unlock();
    this.startGame();
  };

  private readonly handleSoundToggleClick = (): void => {
    const nextEnabled = !this.profile.soundEnabled;
    this.profile.soundEnabled = nextEnabled;
    this.sfx.setEnabled(nextEnabled);
    this.updateSoundButtons();
    this.saveProfile();
    if (nextEnabled) {
      void this.sfx.unlock();
      if (this.isRunning && !this.isPaused && !this.isGameOver) {
        this.sfx.startBgm();
      }
    } else {
      this.sfx.stopBgm();
    }
    this.sfx.playToggle(nextEnabled);
    this.statusText = nextEnabled ? "사운드 ON" : "사운드 OFF";
    this.syncHud();
  };

  private readonly handleCharacterResetClick = (): void => {
    this.setCustomCharacters([], []);
    this.characterStatus.textContent = "기본 캐릭터 사용 중";
    this.statusText = "기본 캐릭터로 복귀";
    this.syncHud();
    this.renderFrame();
  };

  private readonly handleCharacterInputChange = async (): Promise<void> => {
    const files = Array.from(this.characterInput.files ?? []).slice(0, MAX_CUSTOM_CHARACTER_COUNT);
    this.characterInput.value = "";
    if (!files.length) {
      return;
    }

    this.characterStatus.textContent = "캐릭터 이미지를 준비 중...";
    const loadedSprites: Sprite[] = [];
    const objectUrls: string[] = [];
    const skippedNames: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > MAX_CUSTOM_IMAGE_BYTES) {
        skippedNames.push(file.name);
        continue;
      }
      const objectUrl = URL.createObjectURL(file);
      try {
        const image = await loadImage(objectUrl);
        const sprite = createTrimmedSprite(image);
        loadedSprites.push(sprite);
        objectUrls.push(objectUrl);
      } catch {
        URL.revokeObjectURL(objectUrl);
        skippedNames.push(file.name);
      }
    }

    if (!loadedSprites.length) {
      this.characterStatus.textContent = "업로드 실패: 사용할 수 있는 이미지가 없습니다";
      this.renderCharacterPreviews();
      return;
    }

    this.setCustomCharacters(loadedSprites, objectUrls);
    this.characterStatus.textContent = `${loadedSprites.length}개 캐릭터 적용 완료${
      skippedNames.length ? ` (제외 ${skippedNames.length})` : ""
    }`;
    this.statusText = this.isRunning ? "커스텀 캐릭터 적용 (다음 스폰부터)" : "커스텀 캐릭터 적용";
    this.syncHud();
    this.renderFrame();
  };

  private readonly releaseCustomCharacterUrls = (): void => {
    for (const url of this.customCharacterObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.customCharacterObjectUrls = [];
  };

  private readonly handleBeforeUnload = (): void => {
    this.releaseCustomCharacterUrls();
    this.sfx.dispose();
  };

  private readonly handleBragClick = async (): Promise<void> => {
    this.bragButton.disabled = true;
    this.bragButton.textContent = "이미지 준비 중...";
    try {
      void this.sfx.unlock();
      const blob = await this.buildBragImageBlob();
      const filename = this.createBragFilename();
      const shareFile = new File([blob], filename, { type: "image/png" });
      const canNativeShare =
        "share" in navigator &&
        "canShare" in navigator &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [shareFile] });

      if (canNativeShare && typeof navigator.share === "function") {
        await navigator.share({
          files: [shareFile],
          title: "DOTHEGI 점수 자랑",
          text: `점수 ${this.matchSummary.score}점, 최고콤보 ${this.matchSummary.bestCombo}`
        });
        this.statusText = "공유 완료";
      } else {
        this.downloadBlob(blob, filename);
        this.statusText = "이미지 저장 완료";
      }
      this.sfx.playReward();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.statusText = "공유 취소";
      } else {
        this.statusText = "이미지 저장 실패";
      }
    } finally {
      this.bragButton.disabled = false;
      this.bragButton.textContent = "친구에게 자랑하기 (이미지 저장)";
      this.syncHud();
    }
  };

  private readonly handleRewardClick = (): void => {
    if (this.rewardClaimed) {
      return;
    }
    void this.sfx.unlock();
    this.rewardClaimed = true;
    this.matchSummary.rewardCoins = REWARD_BONUS_COINS;
    this.profile.coins += REWARD_BONUS_COINS;
    this.saveProfile();
    this.rewardButton.disabled = true;
    this.rewardButton.textContent = "보상 수령 완료";
    this.statusText = "보상 +20 코인";
    this.sfx.playReward();
    this.renderResultSummary();
    this.syncHud();
  };

  private readonly handlePauseClick = (): void => {
    if (!this.isRunning) {
      return;
    }
    if (this.stageTransitionLockMs > 0) {
      return;
    }
    void this.sfx.unlock();
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.pauseButton.textContent = "계속";
      this.statusText = "일시정지";
      this.showMessage("일시정지");
      this.sfx.pauseBgm();
      this.sfx.playPause();
    } else {
      this.pauseButton.textContent = "일시정지";
      this.statusText = "플레이 중";
      this.hideMessage();
      this.lastFrameMs = performance.now();
      this.sfx.resumeBgm();
      this.sfx.playResume();
    }
    this.syncHud();
    this.renderFrame();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    void this.sfx.unlock();
    if (!this.isRunning || this.isPaused || this.stageTransitionLockMs > 0) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (!this.isPointInsideBoard(x, y)) {
      return;
    }

    const target = this.findHitMole(x, y);
    if (target) {
      this.registerHit(target);
    } else {
      this.registerMiss(false);
    }
    this.syncHud();
  };

  private readonly tick = (timestamp: number): void => {
    if (!this.isRunning) {
      return;
    }

    if (this.lastFrameMs === 0) {
      this.lastFrameMs = timestamp;
    }
    const deltaMs = Math.min(80, timestamp - this.lastFrameMs);
    this.lastFrameMs = timestamp;

    if (!this.isPaused) {
      this.update(deltaMs);
    }
    this.renderFrame();

    if (this.isRunning) {
      this.rafId = window.requestAnimationFrame(this.tick);
    }
  };

  private async init(): Promise<void> {
    this.showMessage("이미지를 불러오는 중...");
    try {
      const [bg, hole, pop, idle, hit, retreat] = await Promise.all([
        loadImage(assetPath("play_bg_clean.png")),
        loadImage(assetPath("hole_base.png")),
        loadImage(assetPath("mole_normal_pop.png")),
        loadImage(assetPath("mole_normal_idle.png")),
        loadImage(assetPath("mole_normal_hit.png")),
        loadImage(assetPath("mole_normal_retreat.png"))
      ]);

      this.assets = {
        bg,
        hole: createTrimmedSprite(hole),
        pop: createTrimmedSprite(pop),
        idle: createTrimmedSprite(idle),
        hit: createTrimmedSprite(hit),
        retreat: createTrimmedSprite(retreat)
      };
      this.resizeCanvas();
      this.statusText = "준비";
      this.showMessage("게임 시작 준비 완료");
      this.lobbyStartButton.disabled = false;
      this.syncHud();
      this.renderFrame();
    } catch (error) {
      this.statusText = "에셋 로드 실패";
      this.showMessage("에셋 로드 실패\n파일 경로를 확인해주세요");
      this.lobbyStartButton.disabled = true;
      this.syncHud();
      this.renderFrame();
      throw error;
    }
  }

  private startGame(): void {
    this.hideLobby();
    this.level = 1;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.timeRemainingMs = START_TIME_MS;
    this.timeGaugeCapMs = START_TIME_MS;
    this.tierProgress = 0;
    this.skillEMA = 0.5;
    this.promotionState = "none";
    this.promotionTargetLevel = null;
    this.promotionElapsedMs = 0;
    this.levelEaseFromLevel = null;
    this.levelEaseElapsedMs = 0;
    this.levelEaseDurationMs = 0;
    this.stageTransitionLockMs = 0;
    this.stageTransitionResumeText = "플레이 중";
    this.stageFloorLevel = 1;
    this.lowPiStreak = 0;
    this.elapsedMs = 0;
    this.nextCheckpointAtMs = CHECKPOINT_MS;
    this.nextSpawnAtMs = 300;
    this.activeMoles = [];
    this.recentCellIndices = [];
    this.cellCooldownUntil = new Array(this.cells.length).fill(0);
    this.moleSerial = 1;
    this.slowUntilMs = 0;

    this.intervalStats = { hits: 0, misses: 0, reactionTotalMs: 0, reactionCount: 0 };
    this.sessionHits = 0;
    this.sessionMisses = 0;
    this.rewardClaimed = false;
    this.matchSummary = { score: 0, bestCombo: 0, survivalSec: 0, baseCoins: 0, rewardCoins: 0 };

    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;
    this.statusText = "플레이 중";
    this.pauseButton.disabled = false;
    this.pauseButton.textContent = "일시정지";
    this.startButton.textContent = "재시작";
    this.hideMessage();
    this.hideResultModal();
    this.sfx.setBgmTempo(BGM_MIN_TEMPO);
    this.sfx.playStart();
    this.sfx.startBgm();

    this.refreshCells();
    this.lastFrameMs = 0;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = window.requestAnimationFrame(this.tick);
    this.syncHud();
  }

  private update(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.updateBgmTempo();
    if (this.stageTransitionLockMs > 0) {
      this.updateStageTransitionLock(deltaMs);
      return;
    }

    if (this.promotionState !== "pending") {
      this.timeRemainingMs = Math.max(0, this.timeRemainingMs - deltaMs);
    }
    this.updatePromotionState(deltaMs);
    if (this.stageTransitionLockMs > 0) {
      return;
    }
    this.updateLevelEntryEase(deltaMs);

    this.updateMoles(deltaMs);
    this.spawnMolesIfNeeded();
    this.runCheckpointIfNeeded();

    if (this.timeRemainingMs <= 0) {
      this.endGame();
    }
  }

  private updateBgmTempo(): void {
    const timeRatio = clamp(this.elapsedMs / 110_000, 0, 1);
    const timeTempo = lerp(BGM_MIN_TEMPO, 1.34, timeRatio);
    const levelTempo = 1 + Math.max(0, this.level - 1) * 0.035;
    let targetTempo = Math.max(timeTempo, levelTempo);

    if (this.promotionState === "grace") {
      targetTempo *= 0.97;
    }
    if (this.stageTransitionLockMs > 0 || this.getSlowFactor() > 1) {
      targetTempo *= 0.96;
    }

    this.sfx.setBgmTempo(clamp(targetTempo, BGM_MIN_TEMPO, BGM_MAX_TEMPO));
  }

  private updateMoles(deltaMs: number): void {
    for (let i = this.activeMoles.length - 1; i >= 0; i -= 1) {
      const mole = this.activeMoles[i];
      mole.phaseElapsedMs += deltaMs;

      if (mole.phase === "pop" && mole.phaseElapsedMs >= mole.popDurationMs) {
        mole.phase = "idle";
        mole.phaseElapsedMs = 0;
        continue;
      }

      if (mole.phase === "idle" && mole.phaseElapsedMs >= mole.idleDurationMs) {
        if (!mole.wasHit) {
          this.registerMiss(true);
        }
        mole.phase = "retreat";
        mole.phaseElapsedMs = 0;
        continue;
      }

      if (mole.phase === "hit" && mole.phaseElapsedMs >= mole.hitDurationMs) {
        mole.phase = "retreat";
        mole.phaseElapsedMs = 0;
        continue;
      }

      if (mole.phase === "retreat" && mole.phaseElapsedMs >= mole.retreatDurationMs) {
        this.activeMoles.splice(i, 1);
      }
    }
  }

  private spawnMolesIfNeeded(): void {
    if (!this.cells.length) {
      return;
    }

    const profile = this.getDifficultyProfile();
    while (this.elapsedMs >= this.nextSpawnAtMs && this.activeMoles.length < profile.concurrentMax) {
      const didSpawn = this.spawnSingleMole(profile);
      if (!didSpawn) {
        this.nextSpawnAtMs = this.elapsedMs + 120;
        break;
      }
      const slowFactor = this.getSlowFactor();
      const nextInterval = randomBetween(profile.spawnIntervalMs * 0.88, profile.spawnIntervalMs * 1.12) * slowFactor;
      this.nextSpawnAtMs += nextInterval;
    }
  }

  private getSlowFactor(): number {
    return this.elapsedMs < this.slowUntilMs ? 1.35 : 1;
  }

  private spawnSingleMole(profile: DifficultyProfile): boolean {
    const occupied = new Set<number>(this.activeMoles.map((mole) => mole.cellIndex));
    const desiredRecentAvoid = this.recentCellIndices.slice(-3);
    const unlockedCellSet = this.getUnlockedSpawnCellSet();
    const isUnlocked = (cell: Cell) => !unlockedCellSet || unlockedCellSet.has(cell.index);

    let candidates = this.cells
      .filter((cell) => isUnlocked(cell))
      .filter((cell) => !occupied.has(cell.index))
      .filter((cell) => this.elapsedMs >= (this.cellCooldownUntil[cell.index] ?? 0))
      .filter((cell) => !desiredRecentAvoid.includes(cell.index))
      .map((cell) => cell.index);

    if (!candidates.length) {
      candidates = this.cells
        .filter((cell) => isUnlocked(cell))
        .filter((cell) => !occupied.has(cell.index))
        .filter((cell) => this.elapsedMs >= (this.cellCooldownUntil[cell.index] ?? 0))
        .map((cell) => cell.index);
    }
    if (!candidates.length) {
      candidates = this.cells.filter((cell) => isUnlocked(cell)).filter((cell) => !occupied.has(cell.index)).map((cell) => cell.index);
    }
    if (!candidates.length && unlockedCellSet) {
      candidates = this.cells
        .filter((cell) => !occupied.has(cell.index))
        .filter((cell) => this.elapsedMs >= (this.cellCooldownUntil[cell.index] ?? 0))
        .map((cell) => cell.index);
    }
    if (!candidates.length && unlockedCellSet) {
      candidates = this.cells.filter((cell) => !occupied.has(cell.index)).map((cell) => cell.index);
    }
    if (!candidates.length) {
      return false;
    }

    const concurrencyFloor = profile.concurrentMin;
    if (this.activeMoles.length < concurrencyFloor - 1) {
      this.nextSpawnAtMs = this.elapsedMs;
    }

    const cellIndex = candidates[randomInt(0, candidates.length - 1)];
    const type = this.pickMoleType();

    let idleScale = 1;
    if (type === "gold") {
      idleScale = 0.76;
    }
    if (type === "ice") {
      idleScale = 0.9;
    }
    if (this.getSlowFactor() > 1) {
      idleScale *= 1.2;
    }

    const newMole: ActiveMole = {
      id: this.moleSerial,
      cellIndex,
      type,
      phase: "pop",
      phaseElapsedMs: 0,
      spawnedAtMs: this.elapsedMs,
      popDurationMs: randomBetween(120, 170),
      idleDurationMs: randomBetween(profile.holdMinMs, profile.holdMaxMs) * idleScale,
      hitDurationMs: randomBetween(130, 180),
      retreatDurationMs: randomBetween(100, 150),
      wasHit: false,
      appearanceSprite: this.pickAppearanceSprite()
    };

    this.moleSerial += 1;
    this.activeMoles.push(newMole);
    this.cellCooldownUntil[cellIndex] = this.elapsedMs + CELL_COOLDOWN_MS;
    this.recentCellIndices.push(cellIndex);
    if (this.recentCellIndices.length > 6) {
      this.recentCellIndices.shift();
    }
    return true;
  }

  private getUnlockedSpawnCellSet(): Set<number> | null {
    if (
      this.levelEaseFromLevel === null ||
      this.levelEaseDurationMs <= 0 ||
      !this.cells.length ||
      this.level <= this.levelEaseFromLevel
    ) {
      return null;
    }

    const fromGrid = LEVEL_CONFIGS[this.levelEaseFromLevel].grid;
    const currentGrid = LEVEL_CONFIGS[this.level].grid;
    if (currentGrid <= fromGrid) {
      return null;
    }

    const easeRatio = this.getLevelEntryEaseRatio();
    if (easeRatio >= 0.999) {
      return null;
    }

    const totalCells = this.cells.length;
    const startCells = clamp(fromGrid * fromGrid, 1, totalCells);
    const unlockedCells = clamp(Math.round(lerp(startCells, totalCells, smoothstep(easeRatio))), 1, totalCells);

    const center = (currentGrid - 1) / 2;
    const distance = (cell: Cell) => Math.abs(cell.row - center) + Math.abs(cell.col - center);

    const ranked = [...this.cells].sort((a, b) => {
      const distDiff = distance(a) - distance(b);
      if (distDiff !== 0) {
        return distDiff;
      }
      const hash = (cell: Cell) => ((cell.row * 73856093) ^ (cell.col * 19349663)) >>> 0;
      return hash(a) - hash(b);
    });

    return new Set(ranked.slice(0, unlockedCells).map((cell) => cell.index));
  }

  private getDifficultyProfile(): DifficultyProfile {
    const current = LEVEL_CONFIGS[this.level];
    const nextLevel = Math.min(7, this.level + 1);
    const next = LEVEL_CONFIGS[nextLevel];
    const blendToNext = this.level === 7 ? 0 : this.getTierBlendToNext();

    let spawnIntervalMs = lerp(current.spawnIntervalMs, next.spawnIntervalMs, blendToNext);
    let holdMinMs = lerp(current.holdMinMs, next.holdMinMs, blendToNext);
    let holdMaxMs = lerp(current.holdMaxMs, next.holdMaxMs, blendToNext);

    let concurrentMax = Math.round(lerp(current.concurrentMax, next.concurrentMax, blendToNext));
    let concurrentMin = Math.round(lerp(current.concurrentMin, next.concurrentMin, blendToNext * 0.7));

    if (this.level === 1) {
      // 1탄은 동시 등장 1개를 유지해 난도 점프를 줄인다.
      concurrentMin = 1;
      concurrentMax = 1;
    }

    const levelEntryEaseRatio = this.getLevelEntryEaseRatio();
    if (this.levelEaseFromLevel !== null && levelEntryEaseRatio < 1) {
      const entryFrom = LEVEL_CONFIGS[this.levelEaseFromLevel];
      const ease = smoothstep(levelEntryEaseRatio);
      spawnIntervalMs = lerp(entryFrom.spawnIntervalMs, spawnIntervalMs, ease);
      holdMinMs = lerp(entryFrom.holdMinMs, holdMinMs, ease);
      holdMaxMs = lerp(entryFrom.holdMaxMs, holdMaxMs, ease);
      concurrentMin = Math.round(lerp(entryFrom.concurrentMin, concurrentMin, ease * 0.82));
      concurrentMax = Math.round(lerp(entryFrom.concurrentMax, concurrentMax, ease * 0.82));
    }

    if (this.promotionState === "grace") {
      spawnIntervalMs *= 1.08;
      holdMinMs *= 1.12;
      holdMaxMs *= 1.12;
      concurrentMax = Math.max(1, concurrentMax - 1);
    }

    concurrentMin = clamp(concurrentMin, 1, 3);
    concurrentMax = clamp(concurrentMax, concurrentMin, 3);

    return {
      grid: current.grid,
      spawnIntervalMs,
      holdMinMs,
      holdMaxMs,
      concurrentMin,
      concurrentMax
    };
  }

  private getTierBlendToNext(): number {
    const progressBlend = clamp(this.tierProgress / 100, 0, 1);
    let blend = progressBlend;

    if (this.level === 1) {
      // 1탄은 내부 난이도 상승 곡선을 더 완만하게 설정한다.
      blend = progressBlend < 0.8 ? progressBlend * 0.45 : 0.36 + (progressBlend - 0.8) * 1.2;
    }

    if (this.promotionState === "pending") {
      const pendingBlend = clamp(this.promotionElapsedMs / this.getPendingDurationMs(), 0, 1) * 0.85;
      blend = Math.max(blend, pendingBlend);
    }

    if (this.promotionState === "grace") {
      const graceDurationMs = this.getPromotionGraceDurationMs();
      const graceRatio = 1 - clamp(this.promotionElapsedMs / graceDurationMs, 0, 1);
      blend = Math.min(blend, 0.35 + graceRatio * 0.15);
    }

    return clamp(blend, 0, 1);
  }

  private pickMoleType(): MoleType {
    const startWeights: Record<number, Record<MoleType, number>> = {
      1: { normal: 94, gold: 5, bomb: 1, ice: 0 },
      2: { normal: 82, gold: 11, bomb: 7, ice: 0 },
      3: { normal: 78, gold: 12, bomb: 9, ice: 1 },
      4: { normal: 74, gold: 13, bomb: 11, ice: 2 },
      5: { normal: 71, gold: 14, bomb: 12, ice: 3 },
      6: { normal: 68, gold: 14, bomb: 14, ice: 4 },
      7: { normal: 66, gold: 14, bomb: 15, ice: 5 }
    };
    const endWeights: Record<number, Record<MoleType, number>> = {
      1: { normal: 89, gold: 8, bomb: 3, ice: 0 },
      2: { normal: 76, gold: 13, bomb: 10, ice: 1 },
      3: { normal: 72, gold: 13, bomb: 12, ice: 3 },
      4: { normal: 68, gold: 14, bomb: 14, ice: 4 },
      5: { normal: 65, gold: 15, bomb: 15, ice: 5 },
      6: { normal: 62, gold: 15, bomb: 17, ice: 6 },
      7: { normal: 60, gold: 16, bomb: 18, ice: 6 }
    };

    const blend = this.getTierBlendToNext();
    const start = startWeights[this.level] ?? startWeights[1];
    const end = endWeights[this.level] ?? endWeights[1];
    let normal = lerp(start.normal, end.normal, blend);
    let gold = lerp(start.gold, end.gold, blend);
    let bomb = lerp(start.bomb, end.bomb, blend);
    let ice = lerp(start.ice, end.ice, blend);

    const levelEntryEaseRatio = this.getLevelEntryEaseRatio();
    if (this.levelEaseFromLevel !== null && levelEntryEaseRatio < 1) {
      const safety = 1 - smoothstep(levelEntryEaseRatio);
      normal += 8 * safety;
      gold *= 1 - 0.16 * safety;
      bomb *= 1 - 0.78 * safety;
      ice *= 1 - 0.72 * safety;
    }

    if (this.promotionState === "grace") {
      bomb *= 0.25;
      ice *= 0.5;
      normal += 6;
    }
    if (this.timeRemainingMs <= 9_000) {
      bomb *= 1.05;
      gold *= 1.12;
    }

    normal = Math.max(1, normal);
    gold = Math.max(0.5, gold);
    bomb = Math.max(0.2, bomb);
    ice = Math.max(0, ice);

    return pickWeightedType([
      ["normal", normal],
      ["gold", gold],
      ["bomb", bomb],
      ["ice", ice]
    ]);
  }

  private pickAppearanceSprite(): Sprite | null {
    if (!this.customCharacterSprites.length) {
      return null;
    }
    return this.customCharacterSprites[randomInt(0, this.customCharacterSprites.length - 1)];
  }

  private runCheckpointIfNeeded(): void {
    while (this.elapsedMs >= this.nextCheckpointAtMs) {
      this.evaluateCheckpoint();
      this.nextCheckpointAtMs += CHECKPOINT_MS;
    }
  }

  private updatePromotionState(deltaMs: number): void {
    if (this.promotionState === "none") {
      return;
    }
    this.promotionElapsedMs += deltaMs;

    if (this.promotionState === "pending" && this.promotionElapsedMs >= this.getPendingDurationMs()) {
      const targetLevel = this.promotionTargetLevel ?? this.level + 1;
      const clearedStage = Math.max(1, targetLevel - 1);
      this.setLevel(targetLevel);
      const resetMs = this.resetTimeForStageStart(targetLevel);
      this.promotionState = "grace";
      this.promotionElapsedMs = 0;
      this.beginStageTransitionNotice(clearedStage, targetLevel, resetMs);
      return;
    }

    if (this.promotionState === "grace" && this.promotionElapsedMs >= this.getPromotionGraceDurationMs()) {
      this.promotionState = "none";
      this.promotionTargetLevel = null;
      this.promotionElapsedMs = 0;
      this.statusText = `${this.level}탄 진행`;
    }
  }

  private updateStageTransitionLock(deltaMs: number): void {
    if (this.stageTransitionLockMs <= 0) {
      return;
    }
    this.stageTransitionLockMs = Math.max(0, this.stageTransitionLockMs - deltaMs);
    if (this.stageTransitionLockMs === 0) {
      this.hideMessage();
      if (this.isRunning && !this.isGameOver) {
        this.statusText = this.stageTransitionResumeText;
        this.pauseButton.disabled = false;
      }
    }
  }

  private updateLevelEntryEase(deltaMs: number): void {
    if (this.levelEaseFromLevel === null || this.levelEaseDurationMs <= 0) {
      return;
    }
    this.levelEaseElapsedMs = Math.min(this.levelEaseElapsedMs + deltaMs, this.levelEaseDurationMs);
    if (this.levelEaseElapsedMs >= this.levelEaseDurationMs) {
      this.levelEaseFromLevel = null;
      this.levelEaseElapsedMs = 0;
      this.levelEaseDurationMs = 0;
    }
  }

  private getLevelEntryEaseRatio(): number {
    if (this.levelEaseFromLevel === null || this.levelEaseDurationMs <= 0) {
      return 1;
    }
    return clamp(this.levelEaseElapsedMs / this.levelEaseDurationMs, 0, 1);
  }

  private startPromotion(nextLevel: number): void {
    if (this.promotionState !== "none") {
      return;
    }
    this.promotionState = "pending";
    this.promotionTargetLevel = clamp(nextLevel, 1, 7);
    this.tierProgress = Math.max(this.tierProgress, 88);
    this.promotionElapsedMs = 0;
    const grid = LEVEL_CONFIGS[this.promotionTargetLevel].grid;
    const stage = Math.max(1, this.promotionTargetLevel - 1);
    this.statusText = `${stage}탄 클리어 직전 · ${grid}x${grid} 준비`;
    this.sfx.playLevelUp();
  }

  private getPendingDurationMs(): number {
    return this.level === 1 ? STAGE1_PROMOTION_PENDING_MS : PROMOTION_PENDING_MS;
  }

  private getPromotionGraceDurationMs(): number {
    return PROMOTION_GRACE_MS_BY_LEVEL[this.level] ?? PROMOTION_GRACE_BASE_MS;
  }

  private resetTimeForStageStart(targetLevel: number): number {
    const stageStartMs = clamp(STAGE_START_TIME_MS[targetLevel] ?? START_TIME_MS, 1_000, MAX_TIME_MS);
    this.timeRemainingMs = stageStartMs;
    this.timeGaugeCapMs = stageStartMs;
    return stageStartMs;
  }

  private beginStageTransitionNotice(clearedStage: number, targetLevel: number, stageTimeMs: number): void {
    this.activeMoles = [];
    this.recentCellIndices = [];
    this.nextSpawnAtMs = this.elapsedMs + STAGE_TRANSITION_NOTICE_MS + 180;
    this.stageTransitionLockMs = STAGE_TRANSITION_NOTICE_MS;
    this.stageTransitionResumeText = `${targetLevel}탄 진행`;
    this.pauseButton.disabled = true;
    this.statusText = `${clearedStage}탄 클리어`;
    this.showStageTransitionMessage(clearedStage, targetLevel, Math.round(stageTimeMs / 1000));
  }

  private cancelPromotion(reason: string): void {
    if (this.promotionState !== "pending") {
      return;
    }
    this.promotionState = "none";
    this.promotionTargetLevel = null;
    this.promotionElapsedMs = 0;
    this.statusText = reason;
    this.sfx.playLevelDown();
  }

  private evaluateCheckpoint(): void {
    const hits = this.intervalStats.hits;
    const misses = this.intervalStats.misses;
    const attempts = hits + misses;

    const accuracy = attempts > 0 ? hits / attempts : 0;
    const avgReactionMs = this.intervalStats.reactionCount
      ? this.intervalStats.reactionTotalMs / this.intervalStats.reactionCount
      : 900;
    const speed = clamp(1 - avgReactionMs / 900, 0, 1);
    const comboMetric = clamp(this.combo / 20, 0, 1);
    const pi = 0.45 * accuracy + 0.35 * speed + 0.2 * comboMetric;

    this.skillEMA = lerp(this.skillEMA, pi, 0.25);
    const targetPi = this.getTargetPiForLevel(this.level);
    const passiveRamp = this.level === 1 ? (pi >= 0.34 ? 2.5 : 1.1) : 0.8;
    const performanceScale = this.level === 1 ? 22 : 32;
    const performanceDelta = (this.skillEMA - targetPi) * performanceScale;
    const hitMomentum = clamp((hits - misses) * (this.level === 1 ? 1.4 : 1.1), -8, 10);
    let progressDelta = clamp(passiveRamp + performanceDelta + hitMomentum, -14, 16);
    if (attempts === 0) {
      progressDelta = -2;
    }
    if (this.promotionState === "pending") {
      progressDelta *= 0.45;
    }
    this.tierProgress = clamp(this.tierProgress + progressDelta, 0, 100);

    let bonusMs = 0;
    if (pi >= 0.88) {
      bonusMs += 5000;
    } else if (pi >= 0.75) {
      bonusMs += 3000;
    }
    if (hits > 0 && misses === 0) {
      bonusMs += 1000;
    }
    if (bonusMs > 0) {
      this.timeRemainingMs = Math.min(MAX_TIME_MS, this.timeRemainingMs + bonusMs);
      this.timeGaugeCapMs = Math.max(this.timeGaugeCapMs, this.timeRemainingMs);
    }

    if (pi < 0.4) {
      this.lowPiStreak += 1;
    } else {
      this.lowPiStreak = 0;
    }

    if (
      this.promotionState === "pending" &&
      this.level > 1 &&
      this.skillEMA < targetPi - 0.08 &&
      misses > hits
    ) {
      this.cancelPromotion("전환 보류 · 리듬 회복");
    }

    const requiredHits = this.level === 1 ? 1 : Math.max(2, MIN_HITS_TO_LEVEL_UP[this.level] - 1);
    const requiredProgress = this.level === 1 ? 66 : 80;
    const requiredSkill = this.level === 1 ? targetPi - 0.02 : targetPi + 0.05;
    if (
      this.promotionState === "none" &&
      this.level < 7 &&
      this.tierProgress >= requiredProgress &&
      this.skillEMA >= requiredSkill &&
      hits >= requiredHits
    ) {
      this.startPromotion(this.level + 1);
    }

    const demotionFloor = this.stageFloorLevel >= 2 ? 2 : 1;
    if (
      this.promotionState === "none" &&
      this.level > demotionFloor &&
      this.levelEaseFromLevel === null &&
      this.elapsedMs > 25_000 &&
      this.lowPiStreak >= 4 &&
      this.skillEMA <= targetPi - 0.22 &&
      this.tierProgress <= 16
    ) {
      this.setLevel(Math.max(demotionFloor, this.level - 1));
      this.lowPiStreak = 0;
      this.tierProgress = 60;
      this.statusText = `난이도 완화: ${LEVEL_CONFIGS[this.level].grid}x${LEVEL_CONFIGS[this.level].grid}`;
    }

    const bonusLabel = bonusMs > 0 ? ` · +${Math.round(bonusMs / 1000)}s` : "";
    const progressLabel = ` · 구간 ${Math.round(this.tierProgress)}%`;
    const promotionLabel =
      this.promotionState === "pending"
        ? ` · 전환 ${Math.max(0, Math.ceil((this.getPendingDurationMs() - this.promotionElapsedMs) / 1000))}s`
        : "";
    if (this.promotionState === "none" || this.statusText.startsWith("PI")) {
      this.statusText = `PI ${pi.toFixed(2)}${bonusLabel}${progressLabel}${promotionLabel}`;
    }
    this.intervalStats = { hits: 0, misses: 0, reactionTotalMs: 0, reactionCount: 0 };
  }

  private getTargetPiForLevel(level: number): number {
    const targets: Record<number, number> = {
      1: 0.42,
      2: 0.53,
      3: 0.57,
      4: 0.61,
      5: 0.65,
      6: 0.69,
      7: 0.72
    };
    return targets[level] ?? 0.6;
  }

  private setLevel(nextLevel: number): void {
    const clamped = clamp(nextLevel, 1, 7);
    if (clamped === this.level) {
      return;
    }
    const previous = this.level;
    this.level = clamped;
    this.activeMoles = [];
    this.recentCellIndices = [];
    this.nextSpawnAtMs = this.elapsedMs + 180;
    this.levelEaseFromLevel = null;
    this.levelEaseElapsedMs = 0;
    this.levelEaseDurationMs = 0;
    if (this.level > previous) {
      this.stageFloorLevel = Math.max(this.stageFloorLevel, this.level);
      const easeDurationMs = LEVEL_ENTRY_EASE_MS[this.level] ?? 0;
      if (easeDurationMs > 0) {
        this.levelEaseFromLevel = previous;
        this.levelEaseDurationMs = easeDurationMs;
      }
    }
    this.refreshCells();
    const grid = LEVEL_CONFIGS[this.level].grid;
    const direction = this.level > previous ? "상승" : "하락";
    this.statusText = `난이도 ${direction}: ${grid}x${grid}`;
    if (this.level > previous) {
      this.tierProgress = Math.min(this.tierProgress, 24);
      this.sfx.playLevelUp();
    } else {
      this.tierProgress = Math.max(this.tierProgress, 58);
      this.sfx.playLevelDown();
    }
  }

  private findHitMole(x: number, y: number): ActiveMole | null {
    const candidates = [...this.activeMoles]
      .filter((mole) => mole.phase === "pop" || mole.phase === "idle")
      .sort((a, b) => {
        const cellA = this.cells[a.cellIndex];
        const cellB = this.cells[b.cellIndex];
        return (cellB?.row ?? 0) - (cellA?.row ?? 0);
      });

    for (const mole of candidates) {
      const cell = this.cells[mole.cellIndex];
      if (!cell) {
        continue;
      }
      const metrics = this.getMoleDrawMetrics(mole, cell);
      if (metrics.visibility <= 0.02) {
        continue;
      }

      const visibleTop = metrics.y;
      const visibleBottom = Math.min(metrics.y + metrics.height, metrics.clipBottomY);
      if (visibleBottom <= visibleTop) {
        continue;
      }

      if (x < metrics.x || x > metrics.x + metrics.width || y < visibleTop || y > visibleBottom) {
        continue;
      }

      const visibleHeight = visibleBottom - visibleTop;
      const headHit =
        ((x - (metrics.x + metrics.width * 0.5)) / (metrics.width * 0.34)) ** 2 +
          ((y - (visibleTop + visibleHeight * 0.34)) / (visibleHeight * 0.3)) ** 2 <=
        1;
      const bodyHit =
        ((x - (metrics.x + metrics.width * 0.5)) / (metrics.width * 0.46)) ** 2 +
          ((y - (visibleTop + visibleHeight * 0.64)) / (visibleHeight * 0.44)) ** 2 <=
        1;

      if (headHit || bodyHit) {
        return mole;
      }

      // Keep it forgiving: any click inside visible sprite rect counts.
      return mole;
    }

    return null;
  }

  private registerHit(mole: ActiveMole): void {
    if (!(mole.phase === "pop" || mole.phase === "idle")) {
      return;
    }

    mole.phase = "hit";
    mole.phaseElapsedMs = 0;
    mole.wasHit = true;

    let scoreDelta = 1;
    let timeDeltaMs = 0;

    if (mole.type === "gold") {
      scoreDelta = 3;
    }
    if (mole.type === "bomb") {
      scoreDelta = -3;
      timeDeltaMs = -2000;
      this.combo = 0;
    }
    if (mole.type === "ice") {
      scoreDelta = 1;
      this.slowUntilMs = Math.max(this.slowUntilMs, this.elapsedMs + 2000);
      this.statusText = "ICE · 2초 슬로우";
    }

    const nextCombo = mole.type === "bomb" ? 0 : this.combo + 1;
    this.combo = nextCombo;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    const multiplier = scoreDelta > 0 ? this.getComboMultiplier(this.combo) : 1;
    this.score = Math.max(0, this.score + Math.round(scoreDelta * multiplier));
    this.timeRemainingMs = clamp(this.timeRemainingMs + timeDeltaMs, 0, MAX_TIME_MS);

    this.intervalStats.hits += 1;
    const reaction = Math.max(0, this.elapsedMs - mole.spawnedAtMs);
    this.intervalStats.reactionTotalMs += reaction;
    this.intervalStats.reactionCount += 1;
    this.sessionHits += 1;

    if (mole.type === "normal") {
      this.statusText = `HIT +1 x${this.combo}`;
      this.sfx.playHitNormal();
    }
    if (mole.type === "gold") {
      this.statusText = `GOLD +3 x${this.combo}`;
      this.sfx.playHitGold();
    }
    if (mole.type === "bomb") {
      this.statusText = "BOMB -3 / -2s";
      this.sfx.playHitBomb();
    }
    if (mole.type === "ice") {
      this.sfx.playHitIce();
    }

    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  private registerMiss(fromTimeout: boolean): void {
    this.combo = 0;
    this.intervalStats.misses += 1;
    this.sessionMisses += 1;
    this.statusText = "MISS";
    if (!fromTimeout) {
      this.sfx.playMiss();
    }
  }

  private getComboMultiplier(combo: number): number {
    if (combo >= 15) {
      return 2;
    }
    if (combo >= 10) {
      return 1.5;
    }
    if (combo >= 5) {
      return 1.2;
    }
    return 1;
  }

  private getMoleVisibility(mole: ActiveMole): number {
    if (mole.phase === "pop") {
      return clamp(mole.phaseElapsedMs / mole.popDurationMs, 0, 1);
    }
    if (mole.phase === "retreat") {
      return clamp(1 - mole.phaseElapsedMs / mole.retreatDurationMs, 0, 1);
    }
    return 1;
  }

  private resizeCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;

    this.refreshCells();
    this.renderFrame();
  }

  private refreshCells(): void {
    if (!this.canvasWidth || !this.canvasHeight) {
      return;
    }

    const config = LEVEL_CONFIGS[this.level];
    const grid = config.grid;
    const overlayGap = this.canvasHeight * 0.02;
    const hudHeight = this.hudOverlay.getBoundingClientRect().height;
    const gaugeHeight = this.timeGaugeOverlay.getBoundingClientRect().height;
    const controlHeight = this.controlOverlay.getBoundingClientRect().height;
    const safeTop = clamp(hudHeight + overlayGap + gaugeHeight * 0.12, 0, this.canvasHeight * 0.7);
    const safeBottomLimit = clamp(
      this.canvasHeight - controlHeight - overlayGap,
      safeTop + 80,
      this.canvasHeight
    );

    const boardHeightToWidthRatio = 0.82;
    const maxBoardWidth = this.canvasWidth * 0.8;
    const maxBoardHeight = Math.max(80, safeBottomLimit - safeTop);
    const preferredBoardHeight = maxBoardWidth * boardHeightToWidthRatio;
    const boardHeight = Math.min(maxBoardHeight, preferredBoardHeight);
    const boardWidth = Math.min(maxBoardWidth, boardHeight / boardHeightToWidthRatio);

    const boardY = clamp((safeTop + safeBottomLimit - boardHeight) / 2, safeTop, safeBottomLimit - boardHeight);

    const boardRect: BoardRect = {
      x: (this.canvasWidth - boardWidth) / 2,
      y: boardY,
      width: boardWidth,
      height: boardHeight
    };
    this.boardRect = boardRect;

    const stepX = boardRect.width / grid;
    const stepY = boardRect.height / grid;
    const holeAspect = this.assets ? this.assets.hole.sw / this.assets.hole.sh : 1.5;
    const moleAspect = this.assets ? this.assets.idle.sw / this.assets.idle.sh : 1.5;

    const nextCells: Cell[] = [];
    let index = 0;
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const centerX = boardRect.x + (col + 0.5) * stepX;
        const centerY = boardRect.y + (row + 0.5) * stepY;
        const baseSize = Math.min(stepX, stepY) * 0.96;
        const rowScale = grid > 1 ? 1 + (row / (grid - 1)) * 0.1 : 1;
        const holeWidth = baseSize * rowScale;
        const holeHeight = holeWidth / holeAspect;
        const moleWidth = holeWidth * MOLE_SIZE_FACTOR;
        const moleHeight = moleWidth / moleAspect;
        nextCells.push({
          index,
          row,
          col,
          cx: centerX,
          cy: centerY,
          holeWidth,
          holeHeight,
          moleWidth,
          moleHeight
        });
        index += 1;
      }
    }

    this.cells = nextCells;
    this.activeMoles = this.activeMoles.filter((mole) => mole.cellIndex < this.cells.length);
    this.recentCellIndices = this.recentCellIndices.filter((cellIndex) => cellIndex < this.cells.length);
    this.cellCooldownUntil = new Array(this.cells.length).fill(0);
  }

  private isPointInsideBoard(x: number, y: number): boolean {
    const { x: bx, y: by, width, height } = this.boardRect;
    return x >= bx && x <= bx + width && y >= by && y <= by + height;
  }

  private endGame(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.isGameOver = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    this.pauseButton.disabled = true;
    this.pauseButton.textContent = "일시정지";
    this.startButton.textContent = "다시 시작";

    const surviveSec = Math.round(this.elapsedMs / 1000);
    const comboBonus = this.bestCombo >= 10 ? 3 : 0;
    const surviveBonus = surviveSec >= 60 ? 10 : surviveSec >= 45 ? 5 : 0;
    const baseCoins = Math.max(0, Math.floor(this.score / 10) + comboBonus + surviveBonus);

    this.matchSummary = {
      score: this.score,
      bestCombo: this.bestCombo,
      survivalSec: surviveSec,
      baseCoins,
      rewardCoins: 0
    };

    this.profile.totalPlays += 1;
    this.profile.totalHits += this.sessionHits;
    this.profile.totalMisses += this.sessionMisses;
    this.profile.bestScore = Math.max(this.profile.bestScore, this.score);
    this.profile.bestCombo = Math.max(this.profile.bestCombo, this.bestCombo);
    this.profile.coins += baseCoins;
    this.saveProfile();
    this.sfx.stopBgm();
    this.sfx.playGameOver();

    this.statusText = `종료 · 점수 ${this.score}`;
    this.hideMessage();
    this.showResultModal();
    this.renderResultSummary();
    this.syncHud();
    this.renderFrame();
  }

  private updateSoundButtons(): void {
    const isEnabled = this.profile.soundEnabled;
    const nextText = isEnabled ? "사운드 ON" : "사운드 OFF";
    this.soundButton.textContent = nextText;
    this.soundButton.setAttribute("aria-pressed", String(isEnabled));
    this.lobbySoundButton.textContent = nextText;
    this.lobbySoundButton.setAttribute("aria-pressed", String(isEnabled));
  }

  private syncHud(): void {
    if (this.timeRemainingMs > this.timeGaugeCapMs) {
      this.timeGaugeCapMs = Math.min(MAX_TIME_MS, this.timeRemainingMs);
    }

    const remainingSec = Math.max(0, Math.ceil(this.timeRemainingMs / 1000));
    this.scoreValue.textContent = String(this.score);
    this.timeValue.textContent = String(remainingSec);

    const currentGrid = LEVEL_CONFIGS[this.level].grid;
    if (this.promotionState === "pending" && this.promotionTargetLevel) {
      this.levelValue.textContent = `${this.level}→${this.promotionTargetLevel}탄`;
    } else {
      this.levelValue.textContent = `${this.level}탄 ${currentGrid}x${currentGrid}`;
    }

    this.comboValue.textContent = String(this.combo);
    this.bestValue.textContent = String(this.profile.bestScore);
    this.coinsValue.textContent = String(this.profile.coins);

    const capMs = Math.max(START_TIME_MS, this.timeGaugeCapMs);
    const fillRatio = clamp(this.timeRemainingMs / capMs, 0, 1);
    this.timeGaugeFill.style.width = `${(fillRatio * 100).toFixed(2)}%`;
    this.timeGaugeFill.classList.remove("warn", "critical");
    if (fillRatio <= 0.35) {
      this.timeGaugeFill.classList.add("critical");
    } else if (fillRatio <= 0.6) {
      this.timeGaugeFill.classList.add("warn");
    }
    this.timeGaugeText.textContent = `${remainingSec}s`;

    const slowTag = this.getSlowFactor() > 1 ? " · SLOW" : "";
    const promotionTag =
      this.promotionState === "pending"
        ? " · 전환준비"
        : this.promotionState === "grace"
          ? " · 적응중"
          : "";
    const transitionTag = this.stageTransitionLockMs > 0 ? " · 스테이지전환" : "";
    const entryEaseTag =
      this.levelEaseFromLevel !== null ? ` · 확장적응 ${Math.round(this.getLevelEntryEaseRatio() * 100)}%` : "";
    this.statusLine.textContent = `${this.statusText}${slowTag}${promotionTag}${transitionTag}${entryEaseTag} · 활성 ${this.activeMoles.length}`;
  }

  private renderFrame(): void {
    if (!this.assets || !this.canvasWidth || !this.canvasHeight) {
      return;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawImageCover(this.assets.bg);
    this.drawHoles();
    this.drawMoles();
    this.drawHoleFrontRims();

    if (this.getSlowFactor() > 1 && this.isRunning && !this.isPaused) {
      ctx.fillStyle = "rgba(144, 213, 255, 0.08)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    if (this.isPaused || this.isGameOver) {
      ctx.fillStyle = "rgba(20, 16, 10, 0.22)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    this.syncHud();
  }

  private drawImageCover(image: HTMLImageElement): void {
    this.drawImageCoverToRect(this.ctx, image, 0, 0, this.canvasWidth, this.canvasHeight);
  }

  private drawImageCoverToRect(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number
  ): void {
    const imageAspect = image.width / image.height;
    const targetAspect = targetWidth / targetHeight;

    let drawWidth = targetWidth;
    let drawHeight = targetHeight;
    let offsetX = targetX;
    let offsetY = targetY;

    if (imageAspect > targetAspect) {
      drawHeight = targetHeight;
      drawWidth = drawHeight * imageAspect;
      offsetX = targetX + (targetWidth - drawWidth) / 2;
    } else {
      drawWidth = targetWidth;
      drawHeight = drawWidth / imageAspect;
      offsetY = targetY + (targetHeight - drawHeight) / 2;
    }
    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  private drawHoles(): void {
    if (!this.assets) {
      return;
    }
    const visibleCellSet = this.getVisibleCellSetForRender();
    const sortedCells = [...this.cells]
      .filter((cell) => !visibleCellSet || visibleCellSet.has(cell.index))
      .sort((a, b) => a.row - b.row);
    for (const cell of sortedCells) {
      this.drawSprite(
        this.assets.hole,
        cell.cx - cell.holeWidth / 2,
        cell.cy - cell.holeHeight / 2,
        cell.holeWidth,
        cell.holeHeight
      );
    }
  }

  private drawHoleFrontRims(): void {
    if (!this.assets) {
      return;
    }
    const visibleCellSet = this.getVisibleCellSetForRender();
    const sortedCells = [...this.cells]
      .filter((cell) => !visibleCellSet || visibleCellSet.has(cell.index))
      .sort((a, b) => a.row - b.row);
    for (const cell of sortedCells) {
      const x = cell.cx - cell.holeWidth / 2;
      const y = cell.cy - cell.holeHeight / 2;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(x, y + cell.holeHeight * HOLE_FRONT_COVER_START, cell.holeWidth, cell.holeHeight);
      this.ctx.clip();
      this.drawSprite(this.assets.hole, x, y, cell.holeWidth, cell.holeHeight);
      this.ctx.restore();
    }
  }

  private getVisibleCellSetForRender(): Set<number> | null {
    return this.getUnlockedSpawnCellSet();
  }

  private drawMoles(): void {
    if (!this.assets) {
      return;
    }

    const orderedMoles = [...this.activeMoles].sort((a, b) => {
      const rowA = this.cells[a.cellIndex]?.row ?? 0;
      const rowB = this.cells[b.cellIndex]?.row ?? 0;
      return rowA - rowB;
    });

    for (const mole of orderedMoles) {
      const cell = this.cells[mole.cellIndex];
      if (!cell) {
        continue;
      }

      const metrics = this.getMoleDrawMetrics(mole, cell);
      if (metrics.visibility <= 0.01) {
        continue;
      }

      const sprite = this.getSpriteForMole(mole);
      let x = metrics.x;
      let y = metrics.y;

      if (mole.phase === "hit") {
        const shake = Math.sin(mole.phaseElapsedMs / 20) * 2;
        x += shake;
      }

      this.ctx.save();
      this.buildMoleClipPath(cell, metrics.clipBottomY);
      this.ctx.clip();
      this.drawMoleBody(sprite, mole.type, x, y, metrics.width, metrics.height);
      this.ctx.restore();
      this.drawMoleBadge(mole, cell, metrics.visibility);
    }
  }

  private buildMoleClipPath(cell: Cell, clipBottomY: number): void {
    const clipLeft = cell.cx - cell.holeWidth * MOLE_CLIP_RECT_WIDTH_FACTOR;
    const clipRight = cell.cx + cell.holeWidth * MOLE_CLIP_RECT_WIDTH_FACTOR;
    const clipTop = -this.canvasHeight;

    const curveHalfWidth = cell.holeWidth * MOLE_CLIP_CURVE_HALF_WIDTH_FACTOR;
    const curveLeft = cell.cx - curveHalfWidth;
    const curveRight = cell.cx + curveHalfWidth;
    const edgeY = clipBottomY - cell.holeHeight * MOLE_CLIP_CURVE_EDGE_OFFSET_FACTOR;
    const dipY = clipBottomY + cell.holeHeight * MOLE_CLIP_CURVE_DIP_OFFSET_FACTOR;
    const controlOffsetX = curveHalfWidth * 0.58;

    this.ctx.beginPath();
    this.ctx.moveTo(clipLeft, clipTop);
    this.ctx.lineTo(clipRight, clipTop);
    this.ctx.lineTo(clipRight, edgeY);
    this.ctx.lineTo(curveRight, edgeY);
    this.ctx.bezierCurveTo(
      cell.cx + controlOffsetX,
      dipY,
      cell.cx - controlOffsetX,
      dipY,
      curveLeft,
      edgeY
    );
    this.ctx.lineTo(clipLeft, edgeY);
    this.ctx.closePath();
  }

  private getMoleDrawMetrics(mole: ActiveMole, cell: Cell): MoleDrawMetrics {
    const visibility = this.getMoleVisibility(mole);
    const anchorY = cell.cy + cell.holeHeight * MOLE_ANCHOR_Y_FACTOR;
    return {
      x: cell.cx - cell.moleWidth / 2,
      y: anchorY - cell.moleHeight * visibility,
      width: cell.moleWidth,
      height: cell.moleHeight,
      visibility,
      clipBottomY: cell.cy + cell.holeHeight * MOLE_BOTTOM_CLIP_Y_FACTOR
    };
  }

  private drawMoleBody(
    sprite: Sprite,
    type: MoleType,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    this.drawSprite(sprite, x, y, width, height);

    if (type === "normal") {
      return;
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = "source-atop";
    if (type === "gold") {
      this.ctx.fillStyle = "rgba(255, 214, 79, 0.34)";
    } else if (type === "bomb") {
      this.ctx.fillStyle = "rgba(255, 87, 87, 0.3)";
    } else {
      this.ctx.fillStyle = "rgba(126, 219, 255, 0.32)";
    }
    this.ctx.fillRect(x, y, width, height);
    this.ctx.restore();

    if (type === "gold") {
      this.ctx.save();
      this.ctx.globalAlpha = 0.55;
      this.ctx.shadowColor = "#ffd54d";
      this.ctx.shadowBlur = 10;
      this.ctx.strokeStyle = "rgba(255, 215, 96, 0.75)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x + width * 0.12, y + height * 0.12, width * 0.76, height * 0.76);
      this.ctx.restore();
    }
  }

  private drawMoleBadge(mole: ActiveMole, cell: Cell, visibility: number): void {
    let badgeText = "";
    let badgeColor = "#ffffff";

    if (mole.type === "gold") {
      badgeText = "G";
      badgeColor = "#ffd54a";
    }
    if (mole.type === "bomb") {
      badgeText = "!";
      badgeColor = "#ff5d5d";
    }
    if (mole.type === "ice") {
      badgeText = "I";
      badgeColor = "#80d7ff";
    }

    if (!badgeText) {
      return;
    }

    const bx = cell.cx + cell.moleWidth * 0.24;
    const by = cell.cy - cell.moleHeight * visibility * 0.64;

    this.ctx.save();
    this.ctx.fillStyle = "rgba(20, 20, 20, 0.6)";
    this.ctx.beginPath();
    this.ctx.arc(bx, by, Math.max(8, cell.moleWidth * 0.08), 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = badgeColor;
    this.ctx.font = `bold ${Math.max(12, Math.floor(cell.moleWidth * 0.12))}px Trebuchet MS`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(badgeText, bx, by + 1);
    this.ctx.restore();
  }

  private drawSprite(sprite: Sprite, x: number, y: number, width: number, height: number): void {
    this.ctx.drawImage(
      sprite.image,
      sprite.sx,
      sprite.sy,
      sprite.sw,
      sprite.sh,
      x,
      y,
      width,
      height
    );
  }

  private getSpriteForMole(mole: ActiveMole): Sprite {
    if (mole.appearanceSprite) {
      return mole.appearanceSprite;
    }
    return this.getSpriteForPhase(mole.phase);
  }

  private getSpriteForPhase(phase: MolePhase): Sprite {
    if (!this.assets) {
      throw new Error("에셋이 로드되지 않았습니다.");
    }
    if (phase === "pop") {
      return this.assets.pop;
    }
    if (phase === "idle") {
      return this.assets.idle;
    }
    if (phase === "hit") {
      return this.assets.hit;
    }
    return this.assets.retreat;
  }

  private async buildBragImageBlob(): Promise<Blob> {
    if (!this.canvasWidth || !this.canvasHeight) {
      throw new Error("캡처할 게임 화면이 없습니다.");
    }

    const targetWidth = 1280;
    const bragBackground = await this.getBragBackgroundImage();
    const targetHeight = bragBackground ? Math.round((targetWidth * bragBackground.height) / bragBackground.width) : 960;
    const output = document.createElement("canvas");
    output.width = targetWidth;
    output.height = targetHeight;

    const ctx = output.getContext("2d");
    if (!ctx) {
      throw new Error("캡처 컨텍스트를 만들 수 없습니다.");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const totalCoins = this.matchSummary.baseCoins + this.matchSummary.rewardCoins;
    if (bragBackground) {
      this.drawImageCoverToRect(ctx, bragBackground, 0, 0, output.width, output.height);
      ctx.fillStyle = "rgba(16, 26, 12, 0.22)";
      ctx.fillRect(0, 0, output.width, output.height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, output.height);
      gradient.addColorStop(0, "#a9e36f");
      gradient.addColorStop(0.55, "#76be55");
      gradient.addColorStop(1, "#4f9442");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, output.width, output.height);
    }

    const vignette = ctx.createRadialGradient(
      output.width * 0.5,
      output.height * 0.42,
      output.width * 0.25,
      output.width * 0.5,
      output.height * 0.48,
      output.width * 0.82
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, output.width, output.height);

    const headerBandHeight = Math.round(output.height * 0.17);
    const summaryBandY = Math.round(output.height * 0.205);
    const summaryBandHeight = Math.round(output.height * 0.08);
    const footerPanelHeight = Math.round(output.height * 0.19);
    const footerPanelY = output.height - footerPanelHeight - 24;

    ctx.fillStyle = "rgba(18, 29, 16, 0.42)";
    ctx.fillRect(0, 0, output.width, headerBandHeight);

    ctx.fillStyle = "#fff6db";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 62px Trebuchet MS";
    ctx.fillText("DOTHEGI", output.width / 2, Math.round(headerBandHeight * 0.38));
    ctx.font = "700 52px Trebuchet MS";
    ctx.fillText(`${this.matchSummary.score}`, output.width / 2, Math.round(headerBandHeight * 0.77));
    ctx.font = "700 34px Trebuchet MS";
    ctx.fillText("친구에게 점수 자랑!", output.width / 2, Math.round(headerBandHeight * 1.12));

    ctx.fillStyle = "rgba(15, 21, 14, 0.68)";
    ctx.fillRect(40, summaryBandY, output.width - 80, summaryBandHeight);
    ctx.fillStyle = "#fffce9";
    ctx.font = "700 56px Trebuchet MS";
    ctx.fillText(
      `점수 ${this.matchSummary.score} · 최고콤보 ${this.matchSummary.bestCombo} · 생존 ${this.matchSummary.survivalSec}s`,
      output.width / 2,
      summaryBandY + summaryBandHeight / 2
    );

    ctx.fillStyle = "rgba(17, 26, 16, 0.74)";
    ctx.fillRect(52, footerPanelY, output.width - 104, footerPanelHeight);
    ctx.fillStyle = "#fffce9";
    ctx.font = "700 50px Trebuchet MS";
    ctx.fillText(`획득 코인 +${totalCoins}`, output.width / 2, footerPanelY + Math.round(footerPanelHeight * 0.39));
    ctx.font = "700 36px Trebuchet MS";
    ctx.fillText(
      `최고점수 ${this.profile.bestScore} · 현재 코인 ${this.profile.coins}`,
      output.width / 2,
      footerPanelY + Math.round(footerPanelHeight * 0.70)
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      output.toBlob((result) => resolve(result), "image/png");
    });
    if (!blob) {
      throw new Error("이미지 생성 실패");
    }
    return blob;
  }

  private async getBragBackgroundImage(): Promise<HTMLImageElement | null> {
    if (this.bragBackgroundImage) {
      return this.bragBackgroundImage;
    }
    try {
      const image = await loadImage(assetPath("image.png"));
      this.bragBackgroundImage = image;
      return image;
    } catch {
      return null;
    }
  }

  private createBragFilename(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `dothegi-score-${yyyy}${mm}${dd}-${hh}${min}.png`;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  private showResultModal(): void {
    this.resultModal.classList.remove("hidden");
    this.bragButton.disabled = false;
    this.bragButton.textContent = "친구에게 자랑하기 (이미지 저장)";
    this.rewardButton.disabled = false;
    this.rewardButton.textContent = `보상 받기 (+${REWARD_BONUS_COINS} 코인)`;
  }

  private hideResultModal(): void {
    this.resultModal.classList.add("hidden");
  }

  private renderResultSummary(): void {
    const totalCoins = this.matchSummary.baseCoins + this.matchSummary.rewardCoins;
    this.resultSummary.textContent = `점수 ${this.matchSummary.score} · 최고콤보 ${this.matchSummary.bestCombo} · 생존 ${this.matchSummary.survivalSec}s`;
    this.resultSubSummary.textContent = `기본 코인 +${this.matchSummary.baseCoins} / 보상 +${this.matchSummary.rewardCoins} (총 +${totalCoins})`;
  }

  private showMessage(message: string): void {
    this.centerMessage.classList.remove("stage-transition");
    this.centerMessage.textContent = message;
    this.centerMessage.classList.remove("hidden");
  }

  private showStageTransitionMessage(clearedStage: number, targetLevel: number, stageSeconds: number): void {
    const stageGrid = LEVEL_CONFIGS[targetLevel].grid;
    this.centerMessage.classList.remove("stage-transition");
    void this.centerMessage.offsetWidth;
    this.centerMessage.classList.add("stage-transition");
    this.centerMessage.innerHTML = [
      `<span class="stage-toast-kicker">STAGE CLEAR</span>`,
      `<strong class="stage-toast-title">${clearedStage}탄 클리어!</strong>`,
      `<span class="stage-toast-meta">시간 ${stageSeconds}s 리셋</span>`,
      `<span class="stage-toast-next">${targetLevel}탄 ${stageGrid}x${stageGrid} 시작</span>`
    ].join("");
    this.centerMessage.classList.remove("hidden");
  }

  private hideMessage(): void {
    this.centerMessage.classList.remove("stage-transition");
    this.centerMessage.textContent = "";
    this.centerMessage.classList.add("hidden");
  }

  private hideLobby(): void {
    this.lobbyModal.classList.add("hidden");
  }

  private setCustomCharacters(sprites: Sprite[], objectUrls: string[]): void {
    this.releaseCustomCharacterUrls();
    this.customCharacterSprites = sprites;
    this.customCharacterObjectUrls = objectUrls;
    this.renderCharacterPreviews();
    this.refreshCells();
  }

  private renderCharacterPreviews(): void {
    this.characterPreviewList.textContent = "";
    if (!this.customCharacterObjectUrls.length) {
      const empty = document.createElement("span");
      empty.className = "character-preview-empty";
      empty.textContent = "업로드된 캐릭터 없음";
      this.characterPreviewList.append(empty);
      return;
    }
    for (const url of this.customCharacterObjectUrls) {
      const item = document.createElement("img");
      item.className = "character-preview-item";
      item.src = url;
      item.alt = "커스텀 캐릭터";
      this.characterPreviewList.append(item);
    }
  }

  private loadProfile(): GameProfile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...defaultProfile };
      }
      const parsed = JSON.parse(raw) as Partial<GameProfile>;
      return {
        bestScore: Number.isFinite(parsed.bestScore) ? Number(parsed.bestScore) : 0,
        bestCombo: Number.isFinite(parsed.bestCombo) ? Number(parsed.bestCombo) : 0,
        totalPlays: Number.isFinite(parsed.totalPlays) ? Number(parsed.totalPlays) : 0,
        totalHits: Number.isFinite(parsed.totalHits) ? Number(parsed.totalHits) : 0,
        totalMisses: Number.isFinite(parsed.totalMisses) ? Number(parsed.totalMisses) : 0,
        coins: Number.isFinite(parsed.coins) ? Number(parsed.coins) : 0,
        soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : true
      };
    } catch {
      return { ...defaultProfile };
    }
  }

  private saveProfile(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // localStorage 예외(사파리 private mode 등)는 무시한다.
    }
  }
}

new WhackGame();
