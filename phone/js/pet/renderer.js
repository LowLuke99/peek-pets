// Stage: sizing for any phone aspect/orientation, the pet's ground, pose transforms
// and hit-testing. Stage units: 1 unit ≈ pet body width, origin at the pet's ground
// point, +y down. Two looks:
//   • "clay" (WebGL2): lit bodies on a GL canvas, face/props/particles on the 2D canvas
//     above it, back props on a 2D canvas below. Species opt in with gl() + drawFace().
//   • "classic": everything on the 2D canvas (automatic fallback).

import { drawBodyProps, drawWorldProps, drawBackProps } from './props.js';
import { drawOutfit } from './outfit.js';
import { GLStage } from '../gl/glstage.js';
import { PartBuilder } from '../gl/parts.js';
import { buildScene, applyPetTransform } from '../gl/scene.js';

const TAU = Math.PI * 2;
const NO_CUES = Object.freeze({ hand: null, head: null });

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas the top 2D canvas (also receives touches)
   * @param {{glCanvas?: HTMLCanvasElement, backCanvas?: HTMLCanvasElement}} [layers]
   */
  constructor(canvas, layers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.backCanvas = layers.backCanvas ?? null;
    this.backCtx = this.backCanvas?.getContext('2d', { alpha: true });
    this.glCanvas = layers.glCanvas ?? null;
    this.gl = null;
    this.builder = new PartBuilder();
    this.wantGl = false;
    this.backDirty = false;
    this.glDirty = false;
    this.partsDrawn = 0;
    // 2x is visually identical for smooth vector shapes and draws 55% fewer pixels
    // than 3x on Pro iPhones: a real battery win for an always-on pet.
    this.maxDpr = 2;
    this.resize();
  }

  /** 'auto' | 'clay' (WebGL) | 'classic' (2D). Returns the look actually in use. */
  setLook(look) {
    this.wantGl = look === 'clay' || look === 'auto';
    if (this.wantGl && !this.gl && this.glCanvas) {
      this.gl = new GLStage(this.glCanvas, { onLost: () => { this.glDirty = false; } });
      this.resize();
    }
    if (look === 'auto' && this.gl?.software) this.wantGl = false; // keep software GL for when it's asked for
    if (!this.useGl) this.clearLayers();
    return this.useGl ? 'clay' : 'classic';
  }

  get useGl() {
    return Boolean(this.wantGl && this.gl?.ok);
  }

  clearLayers() {
    if (this.glDirty) { this.gl?.clear(); this.glDirty = false; }
    if (this.backDirty && this.backCtx) {
      this.backCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.backCtx.clearRect(0, 0, this.backCanvas.width, this.backCanvas.height);
      this.backDirty = false;
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    if (this.backCanvas) { this.backCanvas.width = this.canvas.width; this.backCanvas.height = this.canvas.height; }
    this.gl?.resize(this.canvas.width, this.canvas.height);
    const portrait = this.H >= this.W;
    // Leave room for the top bar and bottom action dock.
    // The pet is the app: it fills most of the screen between the top bar and dock.
    this.baseS = portrait ? Math.min(this.W * 0.86, this.H * 0.47) : Math.min(this.W * 0.42, this.H * 0.66);
    this.baseOy = portrait ? this.H * 0.73 : this.H * 0.8;
    this.ox = this.W / 2;
    this.S ??= this.baseS;
    this.oy ??= this.baseOy;
    this.layout(1);
  }

  /**
   * Keep the pet clear of a card at the bottom of the screen: `bottomPx` is how far up
   * from the bottom edge is covered (0 = nothing). The pet glides up and shrinks a bit.
   */
  setInset(bottomPx) {
    this.inset = bottomPx;
  }

  /** Eases the stage toward its target layout; k = 1 snaps. */
  layout(k) {
    const floorY = this.H - (this.inset ?? 0) - 14;
    const oy = Math.min(this.baseOy, floorY);
    const top = Math.min(this.H * 0.24, 190); // room for the top bar, status and a bubble
    const S = this.inset ? Math.max(this.baseS * 0.55, Math.min(this.baseS, (oy - top) / 1.08)) : this.baseS;
    this.S += (S - this.S) * k;
    this.oy += (oy - this.oy) * k;
  }

  tick(dt) {
    this.layout(1 - Math.exp(-7 * dt));
  }

  /** Back props (behind the GL body) go on the bottom 2D canvas; cleared once when unused. */
  drawBack(species, pose, speciesState, cues, stage, hoverY) {
    const back = this.backCtx;
    if (!back) return;
    const needed = Boolean(cues.head) || typeof species.drawBack === 'function';
    if (!needed && !this.backDirty) return;
    back.setTransform(1, 0, 0, 1, 0, 0);
    back.clearRect(0, 0, this.backCanvas.width, this.backCanvas.height);
    this.backDirty = needed;
    if (!needed) return;
    back.setTransform(...stage);
    applyPetTransform(back, species, pose, hoverY);
    species.drawBack?.(back, pose, speciesState);
    drawBackProps(back, species, pose, cues);
  }

  /** Lower render resolution if frames are slow (keeps 60 fps on older iPhones). */
  degrade() {
    if (this.maxDpr <= 1.25) return false;
    this.maxDpr = Math.max(1.25, this.maxDpr - 0.5);
    this.resize();
    return true;
  }

  toStage(px, py) {
    return { x: (px - this.ox) / this.S, y: (py - this.oy) / this.S };
  }

  toScreen(x, y) {
    return { x: this.ox + x * this.S, y: this.oy + y * this.S };
  }

  /** Stage bounds (for toys bouncing around). */
  get bounds() {
    return {
      left: -this.ox / this.S, right: (this.W - this.ox) / this.S,
      top: -this.oy / this.S, bottom: (this.H - this.oy) / this.S,
    };
  }

  /** Center of the pet's body in stage units for the given pose. */
  bodyCenter(species, pose) {
    const lift = species.grounded ? species.groundY : species.floatY + hover(species, pose);
    return { x: pose.x, y: pose.y - lift };
  }

  /** Where to place speech bubbles: just above the head, in screen px. */
  headTop(species, pose) {
    const c = this.bodyCenter(species, pose);
    return this.toScreen(c.x, c.y - (species.hit.ry + 0.1));
  }

  hitTest(species, pose, px, py) {
    const p = this.toStage(px, py);
    const c = this.bodyCenter(species, pose);
    const h = species.hit;
    const dx = (p.x - c.x - h.cx) / h.rx, dy = (p.y - c.y - h.cy) / h.ry;
    if (dx * dx + dy * dy > 1) return null;
    const f = species.face;
    for (const [side, ex] of [['L', f.lx], ['R', f.rx]]) {
      if (Math.hypot(p.x - c.x - ex, p.y - c.y - f.y) < f.r * 1.5) return { part: 'eye', side };
    }
    return { part: 'body' };
  }

  /** @param {{cues?: object, info?: object, outfit?: object}} [props] what the pet holds (powers) and wears (wardrobe) */
  draw(species, pose, speciesState, particles, toys, props = null) {
    const { ctx, dpr, S } = this;
    const stage = [dpr * S, 0, 0, dpr * S, dpr * this.ox, dpr * this.oy];
    const clay = this.useGl && typeof species.gl === 'function' && typeof species.drawFace === 'function';
    const hoverY = hover(species, pose);
    const cues = props?.cues ?? NO_CUES;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(...stage);

    if (clay) {
      this.gl.clear();
      this.partsDrawn = this.gl.draw(buildScene(this.builder.reset(stage), species, pose, speciesState, hoverY));
      this.glDirty = true;
      this.drawBack(species, pose, speciesState, cues, stage, hoverY);
    } else {
      this.clearLayers();
      if (species.grounded) drawPedestal(ctx, species.palette.pedestal);
      drawShadow(ctx, species, pose);
    }

    ctx.save();
    applyPetTransform(ctx, species, pose, hoverY);
    if (clay) {
      species.drawFace(ctx, pose, speciesState);
    } else {
      drawBackProps(ctx, species, pose, cues);
      species.draw(ctx, pose, speciesState);
    }
    drawBodyProps(ctx, species, pose, cues, props?.info);
    drawOutfit(ctx, species, pose, props?.outfit);
    ctx.restore();

    drawWorldProps(ctx, species, pose, cues, props?.info);
    toys?.draw(ctx);
    particles.draw(ctx);
  }
}

function hover(species, pose) {
  if (species.grounded) return 0;
  return Math.sin(pose.t * (1.1 + pose.energy * 0.8)) * (species.bob ?? 0.03) * pose.calm + pose.hop * 0.6;
}

function drawPedestal(ctx, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, 0.035, 0.8, 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(0, 0.0, 0.74, 0.1, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawShadow(ctx, species, pose) {
  const lift = species.grounded ? pose.hop : species.floatY + Math.max(0, pose.hop);
  const k = Math.max(0.35, 1 - lift * 0.9);
  const w = (species.shadowW ?? 0.42) * k * (pose.sx ?? 1);
  ctx.save();
  const g = ctx.createRadialGradient(pose.x * 0.5, 0, 0, pose.x * 0.5, 0, w);
  g.addColorStop(0, `rgba(120,50,40,${0.26 * k})`);
  g.addColorStop(1, 'rgba(120,50,40,0)');
  ctx.fillStyle = g;
  ctx.scale(1, 0.22);
  ctx.beginPath();
  ctx.arc(pose.x * 0.5, 0, w, 0, TAU);
  ctx.fill();
  if (species.grounded) {
    // Tight contact shadow: what makes a body feel like it actually sits on the floor.
    const cw = w * 0.82;
    const c = ctx.createRadialGradient(pose.x, 0, 0, pose.x, 0, cw);
    c.addColorStop(0, `rgba(110,40,32,${0.34 * k * k})`);
    c.addColorStop(0.6, `rgba(110,40,32,${0.12 * k * k})`);
    c.addColorStop(1, 'rgba(110,40,32,0)');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(pose.x, 0, cw, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
