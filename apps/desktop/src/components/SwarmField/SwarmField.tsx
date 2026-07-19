import { useEffect, useRef } from "react";
import { Application, Graphics, Container } from "pixi.js";
import { createReactiveEngine, type ReactiveEngine, type ReactiveState } from "../../lib/musicReactiveEngine";

interface BeeParticle {
  x: number; y: number;
  vx: number; vy: number;
  targetX: number; targetY: number;
  size: number;
  color: number;
  alpha: number;
  phase: number;
  agentId: string;
  state: "idle" | "seeking" | "delivering" | "returning";
  life: number;
}

interface AmbientParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  alpha: number;
}

interface RingParticle {
  x: number; y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: number;
}

const AGENT_COLORS: Record<string, number> = {
  rhythm: 0xff6b35,
  melody: 0x4fc3f7,
  harmony: 0xab47bc,
  arrangement: 0x66bb6a,
  drums: 0xef5350,
  mix: 0xffa726,
  structure: 0x42a5f5,
  mood: 0xec407a,
};

const DEFAULT_COLOR = 0xf3b217;
const AMBIENT_COUNT = 80;
const AGENT_NAMES = Object.keys(AGENT_COLORS);

function createBees(width: number, height: number): BeeParticle[] {
  return AGENT_NAMES.map((agentId, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0, vy: 0,
    targetX: width * (i / AGENT_NAMES.length),
    targetY: height * 0.3 + Math.random() * height * 0.4,
    size: 2 + Math.random() * 3,
    color: AGENT_COLORS[agentId] ?? DEFAULT_COLOR,
    alpha: 0.6 + Math.random() * 0.4,
    phase: Math.random() * Math.PI * 2,
    agentId,
    state: "idle" as const,
    life: 1,
  }));
}

function createAmbient(width: number, height: number): AmbientParticle[] {
  return Array.from({ length: AMBIENT_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    size: 0.5 + Math.random() * 1.5,
    alpha: 0.1 + Math.random() * 0.25,
  }));
}

interface SwarmFieldProps {
  onEngine?: (engine: ReactiveEngine) => void;
  /** Overlay opacity (0-1). Kept low so the swarm stays ambient over the IDE. */
  opacity?: number;
  /** Stacking order — above the panels, below modal dialogs (which use 1000). */
  zIndex?: number;
}

export function SwarmField({ onEngine, opacity = 0.45, zIndex = 50 }: SwarmFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReactiveEngine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    const engine = createReactiveEngine();
    engineRef.current = engine;
    onEngine?.(engine);

    const app = new Application();
    let bees: BeeParticle[] = [];
    let ambient: AmbientParticle[] = [];
    const rings: RingParticle[] = [];
    let state: ReactiveState = engine.getState();

    (async () => {
      await app.init({
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      if (destroyed) { app.destroy(true); return; }

      container.appendChild(app.canvas as HTMLCanvasElement);

      const swarmLayer = new Container();
      const ambientLayer = new Container();
      const ringLayer = new Container();
      app.stage.addChild(ambientLayer);
      app.stage.addChild(ringLayer);
      app.stage.addChild(swarmLayer);

      const swarmGfx = new Graphics();
      const ambientGfx = new Graphics();
      const ringGfx = new Graphics();
      swarmLayer.addChild(swarmGfx);
      ambientLayer.addChild(ambientGfx);
      ringLayer.addChild(ringGfx);

      const w = () => container.clientWidth || window.innerWidth;
      const h = () => container.clientHeight || window.innerHeight;

      bees = createBees(w(), h());
      ambient = createAmbient(w(), h());

      let time = 0;
      const GROUND_Y_RATIO = 0.85;

      app.ticker.add(() => {
        if (destroyed) return;
        const dt = app.ticker.deltaMS / 1000;
        time += dt;
        state = engine.getState();

        const width = w();
        const height = h();

        const speedMul = state.isPlaying ? 1 : 0.15;
        const energyMul = 0.5 + state.energy * 2;
        const pulse = state.pulseValue;

        // --- ambient particles ---
        ambientGfx.clear();
        for (const p of ambient) {
          if (state.isPlaying) {
            p.vx += (Math.random() - 0.5) * 0.2;
            p.vy += (Math.random() - 0.5) * 0.2;
            p.vx *= 0.98;
            p.vy *= 0.98;
          } else {
            p.vx *= 0.95;
            p.vy *= 0.95;
          }
          p.x += p.vx * speedMul;
          p.y += p.vy * speedMul;
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          const a = p.alpha * (0.5 + energyMul * 0.5);
          ambientGfx.circle(p.x, p.y, p.size);
          ambientGfx.fill({ color: 0xf3b217, alpha: a * 0.3 });
        }

        // --- rings ---
        ringGfx.clear();
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i];
          r.radius += dt * 200;
          r.alpha -= dt * 0.8;
          if (r.alpha <= 0 || r.radius > r.maxRadius) {
            rings.splice(i, 1);
            continue;
          }
          ringGfx.circle(r.x, r.y, r.radius);
          ringGfx.stroke({ color: r.color, alpha: r.alpha * 0.4, width: 1.5 });
        }

        // beat pulse ring
        if (state.bassKick) {
          rings.push({
            x: width / 2, y: height * GROUND_Y_RATIO,
            radius: 5, maxRadius: width * 0.5, alpha: 1,
            color: 0xf3b217,
          });
        }

        // --- bees ---
        swarmGfx.clear();
        for (const bee of bees) {
          bee.phase += dt * (1 + state.energy * 2) * (state.isPlaying ? 2 : 0.5);

          const wanderX = Math.sin(bee.phase * 0.7) * 30;
          const wanderY = Math.cos(bee.phase * 0.5) * 20;

          const tx = bee.targetX + wanderX;
          const ty = bee.targetY + wanderY + Math.sin(time * 0.5 + bee.phase) * 40;

          const dx = tx - bee.x;
          const dy = ty - bee.y;

          let springForce = 0.02 * speedMul;
          if (state.agentActivity.has(bee.agentId)) {
            springForce = 0.08 * energyMul;
          }

          bee.vx += dx * springForce + (Math.random() - 0.5) * 0.5 * speedMul;
          bee.vy += dy * springForce + (Math.random() - 0.5) * 0.5 * speedMul;
          bee.vx *= 0.94;
          bee.vy *= 0.94;
          bee.x += bee.vx;
          bee.y += bee.vy;

          const edgePad = 40;
          if (bee.x < -edgePad) bee.x = width + edgePad;
          if (bee.x > width + edgePad) bee.x = -edgePad;
          if (bee.y < -edgePad) bee.y = height + edgePad;
          if (bee.y > height + edgePad) bee.y = -edgePad;

          const activityBoost = state.agentActivity.has(bee.agentId) ? 0.3 : 0;
          const pulseGlow = state.isPlaying ? pulse * 0.3 : 0;
          const alpha = Math.min(1, bee.alpha + activityBoost + pulseGlow);
          const size = bee.size + (state.agentActivity.has(bee.agentId) ? 1.5 : 0) + pulse * 1;

          // glow
          swarmGfx.circle(bee.x, bee.y, size * 3);
          swarmGfx.fill({ color: bee.color, alpha: alpha * 0.12 });

          // body
          swarmGfx.circle(bee.x, bee.y, size);
          swarmGfx.fill({ color: bee.color, alpha });

          // inner bright
          swarmGfx.circle(bee.x, bee.y, size * 0.5);
          swarmGfx.fill({ color: 0xffffff, alpha: alpha * 0.3 });
        }

        // --- burst events ---
        for (const burst of state.recentBursts) {
          const age = (performance.now() - burst.time) / 800;
          const burstAlpha = Math.max(0, 1 - age);
          const burstRadius = 10 + age * 40;

          swarmGfx.circle(burst.x, burst.y, burstRadius);
          swarmGfx.fill({ color: burst.color, alpha: burstAlpha * 0.15 });

          swarmGfx.circle(burst.x, burst.y, burstRadius * 0.3);
          swarmGfx.fill({ color: burst.color, alpha: burstAlpha * 0.4 });
        }
      });
    })();

    return () => {
      destroyed = true;
      engine.destroy();
      app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex,
        opacity,
      }}
    />
  );
}
