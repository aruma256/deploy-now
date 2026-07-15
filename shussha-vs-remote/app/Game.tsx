"use client";

// ゲームのコア（ボール・陣地の物理挙動）は Koen van Gilst 氏の Pong Wars を
// 改変して利用しています。MIT License:
// https://github.com/vnglst/pong-wars

import { useEffect, useRef, useState } from "react";

const CANVAS_SIZE = 600;
const SQUARE_SIZE = 50;
const NUM_X = CANVAS_SIZE / SQUARE_SIZE;
const NUM_Y = CANVAS_SIZE / SQUARE_SIZE;
const MIN_SPEED = 7.5;
const MAX_SPEED = 15;
const STEP_MS = 10; // 物理演算は100fps相当の固定タイムステップ
const GAME_MS = 10_000;
// 開始前演出: 「連打して生産性を上げろ！」→ READY… → GO!! でゲーム開始
const SHOUT_MS = 1300;
const READY_MS = 800;
const PREROLL_MS = SHOUT_MS + READY_MS;
const GO_LINGER_MS = 600;

// 連打ブースト: 直近1秒間の連打数に応じて自チームのボールが加速する。
// 上限を設けて圧勝しすぎないようにしつつ、Pong Wars 自体が持つ
// 「劣勢側が巻き返しやすい」性質と釣り合わせている。
const BOOST_WINDOW_MS = 1000;
const BOOST_MAX_HITS = 12;
const BOOST_PER_HIT = 0.035; // 最大 1.42 倍

const OFFICE = 0;
const REMOTE = 1;
type Team = typeof OFFICE | typeof REMOTE;

const TEAM_INFO = [
  { name: "出社", squareColor: "#005BAC", ballColor: "#F1F6F4" },
  { name: "リモート", squareColor: "#FFC801", ballColor: "#172B36" },
] as const;

// 連打演出（衝撃波リング・火花・残像トレイル）
const ACCENT_COLOR = ["#7CC4FF", "#FFE36E"] as const;
const RING_LIFE_MS = 350;
const SPARK_LIFE_MS = 450;
const SPARKS_PER_TAP = 8;
const TRAIL_LENGTH = 12;

// 戦況連動の背景色（各チームカラーを暗くしたもの）
const BG_OFFICE = "#04294f";
const BG_REMOTE = "#4a3a05";

type Ball = { x: number; y: number; dx: number; dy: number; team: Team };

type Ring = { x: number; y: number; born: number };
type Spark = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  born: number;
  color: string;
};

type Phase = "select" | "playing" | "result";

type GameResult = {
  winner: Team | null; // null = 引き分け
  officePct: number;
  remotePct: number;
  taps: number;
  playerTeam: Team;
};

function createGrid(): Uint8Array {
  const grid = new Uint8Array(NUM_X * NUM_Y);
  for (let i = 0; i < NUM_X; i++) {
    for (let j = 0; j < NUM_Y; j++) {
      grid[i * NUM_Y + j] = i < NUM_X / 2 ? OFFICE : REMOTE;
    }
  }
  return grid;
}

function createBalls(): Ball[] {
  return [
    { x: CANVAS_SIZE / 4, y: CANVAS_SIZE / 2, dx: 12, dy: -12, team: OFFICE },
    {
      x: (CANVAS_SIZE / 4) * 3,
      y: CANVAS_SIZE / 2,
      dx: -12,
      dy: 12,
      team: REMOTE,
    },
  ];
}

function checkSquareCollision(ball: Ball, grid: Uint8Array) {
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    const checkX = ball.x + Math.cos(angle) * (SQUARE_SIZE / 2);
    const checkY = ball.y + Math.sin(angle) * (SQUARE_SIZE / 2);

    const i = Math.floor(checkX / SQUARE_SIZE);
    const j = Math.floor(checkY / SQUARE_SIZE);

    if (i >= 0 && i < NUM_X && j >= 0 && j < NUM_Y) {
      const idx = i * NUM_Y + j;
      if (grid[idx] !== ball.team) {
        grid[idx] = ball.team;
        if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
          ball.dx = -ball.dx;
        } else {
          ball.dy = -ball.dy;
        }
      }
    }
  }
}

function checkBoundaryCollision(ball: Ball, mult: number) {
  if (
    ball.x + ball.dx * mult > CANVAS_SIZE - SQUARE_SIZE / 2 ||
    ball.x + ball.dx * mult < SQUARE_SIZE / 2
  ) {
    ball.dx = -ball.dx;
  }
  if (
    ball.y + ball.dy * mult > CANVAS_SIZE - SQUARE_SIZE / 2 ||
    ball.y + ball.dy * mult < SQUARE_SIZE / 2
  ) {
    ball.dy = -ball.dy;
  }
}

function addRandomness(ball: Ball) {
  ball.dx += Math.random() * 0.02 - 0.01;
  ball.dy += Math.random() * 0.02 - 0.01;

  ball.dx = Math.min(Math.max(ball.dx, -MAX_SPEED), MAX_SPEED);
  ball.dy = Math.min(Math.max(ball.dy, -MAX_SPEED), MAX_SPEED);

  if (Math.abs(ball.dx) < MIN_SPEED) ball.dx = ball.dx > 0 ? MIN_SPEED : -MIN_SPEED;
  if (Math.abs(ball.dy) < MIN_SPEED) ball.dy = ball.dy > 0 ? MIN_SPEED : -MIN_SPEED;
}

function countTeam(grid: Uint8Array, team: Team): number {
  let n = 0;
  for (let k = 0; k < grid.length; k++) if (grid[k] === team) n++;
  return n;
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("select");
  const [prerollStage, setPrerollStage] = useState<
    "shout" | "ready" | "go" | null
  >(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [playerTeam, setPlayerTeam] = useState<Team>(OFFICE);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const officeBarRef = useRef<HTMLDivElement>(null);
  const officePctRef = useRef<HTMLSpanElement>(null);
  const remotePctRef = useRef<HTMLSpanElement>(null);
  const tapTotalRef = useRef<HTMLSpanElement>(null);
  const countdownRef = useRef<HTMLDivElement>(null);
  const keycapRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const gridRef = useRef<Uint8Array>(createGrid());
  const ballsRef = useRef<Ball[]>(createBalls());
  const playerTeamRef = useRef<Team>(OFFICE);
  const tapTimesRef = useRef<number[]>([]);
  const tapTotalCountRef = useRef(0);
  const lastTapRef = useRef(0);
  const ringsRef = useRef<Ring[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  function renderFrame(boostCount: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const grid = gridRef.current;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    for (let i = 0; i < NUM_X; i++) {
      for (let j = 0; j < NUM_Y; j++) {
        ctx.fillStyle = TEAM_INFO[grid[i * NUM_Y + j]].squareColor;
        ctx.fillRect(i * SQUARE_SIZE, j * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
      }
    }

    const now = performance.now();
    const playerBall = ballsRef.current.find(
      (b) => b.team === playerTeamRef.current,
    );

    // ブースト中は自分のボールに残像トレイルを引く
    const trail = trailRef.current;
    if (playerBall) {
      trail.push({ x: playerBall.x, y: playerBall.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    }
    if (boostCount > 0) {
      for (let t = 0; t < trail.length; t++) {
        const k = (t + 1) / trail.length;
        ctx.globalAlpha = k * 0.3;
        ctx.fillStyle = TEAM_INFO[playerTeamRef.current].ballColor;
        ctx.beginPath();
        ctx.arc(
          trail[t].x,
          trail[t].y,
          (SQUARE_SIZE / 2) * (0.3 + 0.7 * k),
          0,
          Math.PI * 2,
          false,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 連打直後は自分のボールを一瞬膨張させて脈打たせる（見た目のみ）
    const sinceTap = now - lastTapRef.current;
    const pulse = sinceTap < 150 ? (1 - sinceTap / 150) * 0.35 : 0;

    for (const ball of ballsRef.current) {
      const isPlayerBall = ball.team === playerTeamRef.current;
      const boosted = isPlayerBall && boostCount > 0;
      ctx.save();
      if (boosted) {
        ctx.shadowColor = TEAM_INFO[ball.team].ballColor;
        ctx.shadowBlur = 6 + boostCount * 2;
      }
      const radius = (SQUARE_SIZE / 2) * (isPlayerBall ? 1 + pulse : 1);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2, false);
      ctx.fillStyle = TEAM_INFO[ball.team].ballColor;
      ctx.fill();
      ctx.closePath();
      ctx.restore();
    }

    // 連打の衝撃波リング
    const accent = ACCENT_COLOR[playerTeamRef.current];
    ringsRef.current = ringsRef.current.filter((r) => now - r.born < RING_LIFE_MS);
    for (const ring of ringsRef.current) {
      const t = (now - ring.born) / RING_LIFE_MS;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, SQUARE_SIZE / 2 + t * 55, 0, Math.PI * 2, false);
      ctx.stroke();
    }

    // 連打の火花パーティクル
    sparksRef.current = sparksRef.current.filter(
      (s) => now - s.born < SPARK_LIFE_MS,
    );
    for (const s of sparksRef.current) {
      const age = now - s.born;
      const t = age / SPARK_LIFE_MS;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x + s.dx * age, s.y + s.dy * age, 3.5 * (1 - t) + 1, 0, Math.PI * 2, false);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function updateHud() {
    const grid = gridRef.current;
    const office = countTeam(grid, OFFICE);
    const officeShare = (office / grid.length) * 100;
    const officePct = Math.round(officeShare);

    if (officeBarRef.current) officeBarRef.current.style.width = `${officeShare}%`;
    if (officePctRef.current) officePctRef.current.textContent = `出社 ${officePct}%`;
    if (remotePctRef.current) remotePctRef.current.textContent = `${100 - officePct}% リモート`;
    if (tapTotalRef.current) tapTotalRef.current.textContent = `${tapTotalCountRef.current}`;

    // 背景色を戦況に連動させる
    document.body.style.background = `linear-gradient(90deg, ${BG_OFFICE} 0%, ${BG_OFFICE} ${
      officeShare - 8
    }%, ${BG_REMOTE} ${officeShare + 8}%, ${BG_REMOTE} 100%)`;
  }

  // 初期盤面の描画（チーム選択画面の背景）
  useEffect(() => {
    if (phase === "select") {
      gridRef.current = createGrid();
      ballsRef.current = createBalls();
      renderFrame(0);
      updateHud();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;

    const playStart = performance.now() + PREROLL_MS;
    let lastTime = performance.now();
    let acc = 0;
    let rafId = 0;
    let finished = false;
    let lastCountdownSec = 0;

    const prerollTimeouts = [
      setTimeout(() => setPrerollStage("ready"), SHOUT_MS),
      setTimeout(() => setPrerollStage("go"), PREROLL_MS),
      setTimeout(() => setPrerollStage(null), PREROLL_MS + GO_LINGER_MS),
    ];

    const registerTap = () => {
      const now = performance.now();
      // GO!! より前（開始演出中）の連打はカウントしない
      if (now < playStart) return;
      tapTimesRef.current.push(now);
      tapTotalCountRef.current++;
      lastTapRef.current = now;

      // 自分のボールから衝撃波と火花を出す
      const ball = ballsRef.current.find(
        (b) => b.team === playerTeamRef.current,
      );
      if (ball) {
        ringsRef.current.push({ x: ball.x, y: ball.y, born: now });
        for (let i = 0; i < SPARKS_PER_TAP; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.08 + Math.random() * 0.15;
          sparksRef.current.push({
            x: ball.x,
            y: ball.y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            born: now,
            color:
              Math.random() < 0.5
                ? "#FFFFFF"
                : ACCENT_COLOR[playerTeamRef.current],
          });
        }
        if (sparksRef.current.length > 240) {
          sparksRef.current.splice(0, sparksRef.current.length - 240);
        }
      }
    };

    // 物理キーボードの入力時、画面上のキーのどれかがランダムに沈む
    const pressTimeouts: (ReturnType<typeof setTimeout> | undefined)[] = [];
    const pressRandomKeycap = () => {
      const idx = Math.floor(Math.random() * 6);
      const el = keycapRefs.current[idx];
      if (!el) return;
      clearTimeout(pressTimeouts[idx]);
      el.classList.add("pressed");
      pressTimeouts[idx] = setTimeout(() => el.classList.remove("pressed"), 100);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key.startsWith("Arrow") || e.key === "Tab") {
        e.preventDefault();
      }
      registerTap();
      pressRandomKeycap();
    };
    const onPointerDown = () => registerTap();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);

    const loop = (now: number) => {
      const taps = tapTimesRef.current;
      while (taps.length > 0 && taps[0] < now - BOOST_WINDOW_MS) taps.shift();
      const boostCount = Math.min(taps.length, BOOST_MAX_HITS);
      const boostMult = 1 + boostCount * BOOST_PER_HIT;

      if (now >= playStart) {
        acc += Math.min(now - Math.max(lastTime, playStart), 100);
      }
      lastTime = now;

      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        for (const ball of ballsRef.current) {
          const mult = ball.team === playerTeamRef.current ? boostMult : 1;
          checkSquareCollision(ball, gridRef.current);
          checkBoundaryCollision(ball, mult);
          ball.x += ball.dx * mult;
          ball.y += ball.dy * mult;
          addRandomness(ball);
        }
      }

      const remaining = Math.min(GAME_MS, GAME_MS - (now - playStart));
      renderFrame(boostCount);
      updateHud();

      // 中央カウントダウン（残り3秒からは強調表示）
      const cdEl = countdownRef.current;
      if (cdEl) {
        const sec = Math.ceil(remaining / 1000);
        if (sec !== lastCountdownSec && sec >= 1) {
          lastCountdownSec = sec;
          cdEl.textContent = `${sec}`;
          cdEl.dataset.final = sec <= 3 ? "true" : "false";
          cdEl.classList.remove("pop");
          void cdEl.offsetWidth;
          cdEl.classList.add("pop");
        }
      }

      if (remaining <= 0) {
        finished = true;
        const grid = gridRef.current;
        const office = countTeam(grid, OFFICE);
        const remote = grid.length - office;
        setResult({
          winner: office > remote ? OFFICE : remote > office ? REMOTE : null,
          officePct: Math.round((office / grid.length) * 100),
          remotePct: Math.round((remote / grid.length) * 100),
          taps: tapTotalCountRef.current,
          playerTeam: playerTeamRef.current,
        });
        setPhase("result");
        return;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      if (!finished) cancelAnimationFrame(rafId);
      prerollTimeouts.forEach(clearTimeout);
      pressTimeouts.forEach(clearTimeout);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [phase]);

  function startGame(team: Team) {
    playerTeamRef.current = team;
    setPlayerTeam(team);
    gridRef.current = createGrid();
    ballsRef.current = createBalls();
    tapTimesRef.current = [];
    tapTotalCountRef.current = 0;
    lastTapRef.current = 0;
    ringsRef.current = [];
    sparksRef.current = [];
    trailRef.current = [];
    setResult(null);
    setPrerollStage("shout");
    setPhase("playing");
  }

  function shareOnX() {
    if (!result) return;
    const outcome =
      result.winner === null
        ? "引き分け"
        : `${TEAM_INFO[result.winner].name}チームの勝利`;
    // url パラメータだと本文と半角スペースで連結されるため、改行込みで text に含める
    const text = `【出社 vs リモート】${outcome}！（出社${result.officePct}% : リモート${result.remotePct}%）私の生産性: ${result.taps}回\n${location.href} #出社リモートWARS`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  }

  return (
    <main className="wrap">
      <h1 className="title">
        <span className="office-text">出社</span>
        <span className="vs">vs</span>
        <span className="remote-text">リモート</span>
      </h1>

      <div className="stage">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="canvas"
        />

        {phase === "select" && (
          <div className="overlay">
            <div className="panel">
              <p className="lead">あなたはどっち派？</p>
              <div className="button-row">
                <button
                  className="team-button team-button-office"
                  onClick={() => startGame(OFFICE)}
                >
                  出社
                </button>
                <button
                  className="team-button team-button-remote"
                  onClick={() => startGame(REMOTE)}
                >
                  リモート
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "playing" &&
          (prerollStage === "shout" || prerollStage === "ready") && (
            <div className="overlay overlay-clear">
              <div className="shout" key={prerollStage}>
                {prerollStage === "shout" ? (
                  <>
                    キーボードを連打して
                    <br />
                    生産性を上げろ！
                  </>
                ) : (
                  "READY…"
                )}
              </div>
            </div>
          )}

        {phase === "playing" && prerollStage === "go" && (
          <div className="go-flash">GO!!</div>
        )}

        {phase === "playing" && prerollStage === null && (
          <div className="countdown" ref={countdownRef} />
        )}

        {phase === "result" && result && (
          <div className="overlay">
            <div className="panel">
              <p className="lead">
                {result.winner === null
                  ? "引き分け"
                  : result.winner === result.playerTeam
                    ? "勝利！"
                    : "敗北…"}
              </p>
              <p className="result-score">
                出社 {result.officePct}% : {result.remotePct}% リモート
              </p>
              <p className="desc">
                あなたの生産性: {result.taps} 回
                {result.winner === null && (
                  <>
                    <br />
                    ……ハイブリッド勤務ということで。
                  </>
                )}
              </p>
              <div className="button-row button-row-wrap">
                <button
                  className="team-button team-button-primary"
                  onClick={() => setPhase("select")}
                >
                  もう一度
                </button>
                <button className="team-button team-button-plain" onClick={shareOnX}>
                  Xで結果をシェア
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bar">
        <div className="bar-office" ref={officeBarRef} />
        <span className="bar-label bar-label-left" ref={officePctRef}>
          出社 50%
        </span>
        <span className="bar-label bar-label-right" ref={remotePctRef}>
          50% リモート
        </span>
      </div>

      {phase === "playing" && (
        <div className="key-cluster">
          <div className="key-row">
            {["生", "産", "性"].map((k, i) => (
              <button
                key={k}
                ref={(el) => {
                  keycapRefs.current[i] = el;
                }}
                className={`keycap ${
                  playerTeam === OFFICE ? "keycap-office" : "keycap-remote"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="key-row key-row-shifted">
            {["U", "P", "!"].map((k, i) => (
              <button
                key={k}
                ref={(el) => {
                  keycapRefs.current[i + 3] = el;
                }}
                className={`keycap ${
                  playerTeam === OFFICE ? "keycap-office" : "keycap-remote"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="tap-counter">
            生産性: <span ref={tapTotalRef}>0</span> 回
          </div>
        </div>
      )}

      <footer className="footer">
        <a href="/licenses">オープンソースライセンス</a>
        {" | "}
        <a
          href="https://x.com/aruma256"
          target="_blank"
          rel="noopener noreferrer"
        >
          @aruma256
        </a>
      </footer>
    </main>
  );
}
