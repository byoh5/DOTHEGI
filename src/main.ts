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

const START_TIME_MS = 30_000;
const MAX_TIME_MS = 120_000;
const CHECKPOINT_MS = 5_000;
const CELL_COOLDOWN_MS = 900;
const STORAGE_KEY = "dothegi.profile.v2";
const REWARD_BONUS_COINS = 20;
const MOLE_ANCHOR_Y_FACTOR = -0.08;
const HOLE_FRONT_COVER_START = 0.32;
const MOLE_BOTTOM_CLIP_Y_FACTOR = 0.08;
const MOLE_SIZE_FACTOR = 0.64;
const MAX_CUSTOM_CHARACTER_COUNT = 6;
const MAX_CUSTOM_IMAGE_BYTES = 6 * 1024 * 1024;

const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1: { grid: 3, concurrentMin: 1, concurrentMax: 1, spawnIntervalMs: 900, holdMinMs: 1000, holdMaxMs: 1200 },
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
  coins: 0
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

class WhackGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scoreValue: HTMLElement;
  private readonly timeValue: HTMLElement;
  private readonly levelValue: HTMLElement;
  private readonly comboValue: HTMLElement;
  private readonly bestValue: HTMLElement;
  private readonly coinsValue: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly centerMessage: HTMLElement;
  private readonly hudOverlay: HTMLElement;
  private readonly controlOverlay: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly characterPickButton: HTMLButtonElement;
  private readonly characterResetButton: HTMLButtonElement;
  private readonly characterInput: HTMLInputElement;
  private readonly characterStatus: HTMLElement;
  private readonly characterPreviewList: HTMLElement;
  private readonly lobbyModal: HTMLElement;
  private readonly lobbyStartButton: HTMLButtonElement;

  private readonly resultModal: HTMLElement;
  private readonly resultSummary: HTMLElement;
  private readonly resultSubSummary: HTMLElement;
  private readonly rewardButton: HTMLButtonElement;
  private readonly replayButton: HTMLButtonElement;

  private assets: Assets | null = null;
  private profile: GameProfile = { ...defaultProfile };
  private customCharacterSprites: Sprite[] = [];
  private customCharacterObjectUrls: string[] = [];

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
    this.statusLine = this.mustGetElement("statusLine");
    this.centerMessage = this.mustGetElement("centerMessage");
    this.hudOverlay = this.mustGetElement("hudOverlay");
    this.controlOverlay = this.mustGetElement("controlOverlay");
    this.startButton = this.mustGetButton("startBtn");
    this.pauseButton = this.mustGetButton("pauseBtn");
    this.characterPickButton = this.mustGetButton("characterPickBtn");
    this.characterResetButton = this.mustGetButton("characterResetBtn");
    this.characterInput = this.mustGetInput("characterInput");
    this.characterStatus = this.mustGetElement("characterStatus");
    this.characterPreviewList = this.mustGetElement("characterPreviewList");
    this.lobbyModal = this.mustGetElement("lobbyModal");
    this.lobbyStartButton = this.mustGetButton("lobbyStartBtn");

    this.resultModal = this.mustGetElement("resultModal");
    this.resultSummary = this.mustGetElement("resultSummary");
    this.resultSubSummary = this.mustGetElement("resultSubSummary");
    this.rewardButton = this.mustGetButton("rewardBtn");
    this.replayButton = this.mustGetButton("replayBtn");

    this.profile = this.loadProfile();
    this.renderCharacterPreviews();
    this.syncHud();
    this.syncViewportHeight();

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("orientationchange", this.handleResize);
    window.visualViewport?.addEventListener("resize", this.handleResize);
    window.visualViewport?.addEventListener("scroll", this.handleResize);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.startButton.addEventListener("click", this.handleStartClick);
    this.pauseButton.addEventListener("click", this.handlePauseClick);
    this.rewardButton.addEventListener("click", this.handleRewardClick);
    this.replayButton.addEventListener("click", this.handleReplayClick);
    this.characterPickButton.addEventListener("click", this.handleCharacterPickClick);
    this.characterResetButton.addEventListener("click", this.handleCharacterResetClick);
    this.characterInput.addEventListener("change", this.handleCharacterInputChange);
    this.lobbyStartButton.addEventListener("click", this.handleLobbyStartClick);
    window.addEventListener("beforeunload", this.releaseCustomCharacterUrls);

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
    this.startGame();
  };

  private readonly handleReplayClick = (): void => {
    if (!this.assets) {
      return;
    }
    this.startGame();
  };

  private readonly handleCharacterPickClick = (): void => {
    this.characterInput.click();
  };

  private readonly handleLobbyStartClick = (): void => {
    if (!this.assets) {
      return;
    }
    this.startGame();
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

  private readonly handleRewardClick = (): void => {
    if (this.rewardClaimed) {
      return;
    }
    this.rewardClaimed = true;
    this.matchSummary.rewardCoins = REWARD_BONUS_COINS;
    this.profile.coins += REWARD_BONUS_COINS;
    this.saveProfile();
    this.rewardButton.disabled = true;
    this.rewardButton.textContent = "보상 수령 완료";
    this.statusText = "보상 +20 코인";
    this.renderResultSummary();
    this.syncHud();
  };

  private readonly handlePauseClick = (): void => {
    if (!this.isRunning) {
      return;
    }
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.pauseButton.textContent = "계속";
      this.statusText = "일시정지";
      this.showMessage("일시정지");
    } else {
      this.pauseButton.textContent = "일시정지";
      this.statusText = "플레이 중";
      this.hideMessage();
      this.lastFrameMs = performance.now();
    }
    this.syncHud();
    this.renderFrame();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.isRunning || this.isPaused) {
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
      this.registerMiss();
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
    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - deltaMs);

    this.updateMoles(deltaMs);
    this.spawnMolesIfNeeded();
    this.runCheckpointIfNeeded();

    if (this.timeRemainingMs <= 0) {
      this.endGame();
    }
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
          this.registerMiss();
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

    const config = LEVEL_CONFIGS[this.level];
    while (this.elapsedMs >= this.nextSpawnAtMs && this.activeMoles.length < config.concurrentMax) {
      const didSpawn = this.spawnSingleMole(config);
      if (!didSpawn) {
        this.nextSpawnAtMs = this.elapsedMs + 120;
        break;
      }
      const slowFactor = this.getSlowFactor();
      const nextInterval = randomBetween(config.spawnIntervalMs * 0.85, config.spawnIntervalMs * 1.15) * slowFactor;
      this.nextSpawnAtMs += nextInterval;
    }
  }

  private getSlowFactor(): number {
    return this.elapsedMs < this.slowUntilMs ? 1.35 : 1;
  }

  private spawnSingleMole(config: LevelConfig): boolean {
    const occupied = new Set<number>(this.activeMoles.map((mole) => mole.cellIndex));
    const desiredRecentAvoid = this.recentCellIndices.slice(-3);

    let candidates = this.cells
      .filter((cell) => !occupied.has(cell.index))
      .filter((cell) => this.elapsedMs >= (this.cellCooldownUntil[cell.index] ?? 0))
      .filter((cell) => !desiredRecentAvoid.includes(cell.index))
      .map((cell) => cell.index);

    if (!candidates.length) {
      candidates = this.cells
        .filter((cell) => !occupied.has(cell.index))
        .filter((cell) => this.elapsedMs >= (this.cellCooldownUntil[cell.index] ?? 0))
        .map((cell) => cell.index);
    }
    if (!candidates.length) {
      candidates = this.cells.filter((cell) => !occupied.has(cell.index)).map((cell) => cell.index);
    }
    if (!candidates.length) {
      return false;
    }

    const concurrencyFloor = config.concurrentMin;
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
      idleDurationMs: randomBetween(config.holdMinMs, config.holdMaxMs) * idleScale,
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

  private pickMoleType(): MoleType {
    if (this.level <= 3) {
      return pickWeightedType([
        ["normal", 88],
        ["gold", 8],
        ["bomb", 4],
        ["ice", 0]
      ]);
    }

    if (this.elapsedMs < 20_000) {
      return pickWeightedType([
        ["normal", 76],
        ["gold", 14],
        ["bomb", 10],
        ["ice", 0]
      ]);
    }

    return pickWeightedType([
      ["normal", 70],
      ["gold", 15],
      ["bomb", 12],
      ["ice", 3]
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

    let bonusMs = 0;
    if (pi >= 0.85) {
      bonusMs += 5000;
    } else if (pi >= 0.7) {
      bonusMs += 3000;
    }
    if (hits > 0 && misses === 0) {
      bonusMs += 1000;
    }
    if (bonusMs > 0) {
      this.timeRemainingMs = Math.min(MAX_TIME_MS, this.timeRemainingMs + bonusMs);
    }

    if (this.level < 7 && pi >= 0.72 && hits >= MIN_HITS_TO_LEVEL_UP[this.level]) {
      this.setLevel(this.level + 1);
    }

    if (pi < 0.4) {
      this.lowPiStreak += 1;
    } else {
      this.lowPiStreak = 0;
    }

    if (this.elapsedMs > 10_000 && this.lowPiStreak >= 2) {
      this.setLevel(this.level - 1);
      this.lowPiStreak = 0;
    }

    const bonusLabel = bonusMs > 0 ? ` · +${Math.round(bonusMs / 1000)}s` : "";
    this.statusText = `PI ${pi.toFixed(2)}${bonusLabel}`;
    this.intervalStats = { hits: 0, misses: 0, reactionTotalMs: 0, reactionCount: 0 };
  }

  private setLevel(nextLevel: number): void {
    const clamped = clamp(nextLevel, 1, 7);
    if (clamped === this.level) {
      return;
    }
    const previous = this.level;
    this.level = clamped;
    this.refreshCells();
    const grid = LEVEL_CONFIGS[this.level].grid;
    const direction = this.level > previous ? "상승" : "하락";
    this.statusText = `난이도 ${direction}: ${grid}x${grid}`;
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
    }
    if (mole.type === "gold") {
      this.statusText = `GOLD +3 x${this.combo}`;
    }
    if (mole.type === "bomb") {
      this.statusText = "BOMB -3 / -2s";
    }

    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  private registerMiss(): void {
    this.combo = 0;
    this.intervalStats.misses += 1;
    this.sessionMisses += 1;
    this.statusText = "MISS";
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
    const controlHeight = this.controlOverlay.getBoundingClientRect().height;
    const safeTop = clamp(hudHeight + overlayGap, 0, this.canvasHeight * 0.7);
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

    this.statusText = `종료 · 점수 ${this.score}`;
    this.hideMessage();
    this.showResultModal();
    this.renderResultSummary();
    this.syncHud();
    this.renderFrame();
  }

  private syncHud(): void {
    this.scoreValue.textContent = String(this.score);
    this.timeValue.textContent = String(Math.max(0, Math.ceil(this.timeRemainingMs / 1000)));
    const grid = LEVEL_CONFIGS[this.level].grid;
    this.levelValue.textContent = `${grid}x${grid}`;
    this.comboValue.textContent = String(this.combo);
    this.bestValue.textContent = String(this.profile.bestScore);
    this.coinsValue.textContent = String(this.profile.coins);

    const slowTag = this.getSlowFactor() > 1 ? " · SLOW" : "";
    this.statusLine.textContent = `${this.statusText}${slowTag} · 활성 ${this.activeMoles.length}`;
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
    const imageAspect = image.width / image.height;
    const canvasAspect = this.canvasWidth / this.canvasHeight;

    let drawWidth = this.canvasWidth;
    let drawHeight = this.canvasHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (imageAspect > canvasAspect) {
      drawHeight = this.canvasHeight;
      drawWidth = drawHeight * imageAspect;
      offsetX = (this.canvasWidth - drawWidth) / 2;
    } else {
      drawWidth = this.canvasWidth;
      drawHeight = drawWidth / imageAspect;
      offsetY = (this.canvasHeight - drawHeight) / 2;
    }
    this.ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  private drawHoles(): void {
    if (!this.assets) {
      return;
    }
    const sortedCells = [...this.cells].sort((a, b) => a.row - b.row);
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
    const sortedCells = [...this.cells].sort((a, b) => a.row - b.row);
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

      const clipLeft = cell.cx - cell.holeWidth * 0.68;
      const clipTop = -this.canvasHeight;
      const clipBottomY = metrics.clipBottomY;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(clipLeft, clipTop, cell.holeWidth * 1.36, clipBottomY - clipTop);
      this.ctx.clip();
      this.drawMoleBody(sprite, mole.type, x, y, metrics.width, metrics.height);
      this.ctx.restore();
      this.drawMoleBadge(mole, cell, metrics.visibility);
    }
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

  private showResultModal(): void {
    this.resultModal.classList.remove("hidden");
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
    this.centerMessage.textContent = message;
    this.centerMessage.classList.remove("hidden");
  }

  private hideMessage(): void {
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
        coins: Number.isFinite(parsed.coins) ? Number(parsed.coins) : 0
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
