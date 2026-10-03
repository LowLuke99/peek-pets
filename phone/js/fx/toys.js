// A bouncy ball to play with. Flick it with a finger; the pet's eyes track it and the
// pet bonks it back when it lands on its head or rolls close.

const TAU = Math.PI * 2;
const GRAVITY = 3.4;
const BOUNCE = 0.74;
const PET_BOUNCE = 0.92;
const KICK_COOLDOWN_S = 1.3;

export class Ball {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.active = false;
    this.r = 0.085;
    this.x = 0; this.y = -1; this.vx = 0; this.vy = 0; this.spin = 0; this.rot = 0;
    this.lastHit = -10;
    this.t = 0;
    this.squash = 0;
  }

  spawn(bounds) {
    this.active = true;
    this.x = bounds.left + 0.3 + this.rand() * (bounds.right - bounds.left - 0.6);
    this.y = bounds.top + 0.45;
    this.vx = (this.rand() - 0.5) * 1.2;
    this.vy = 0.2;
  }

  hide() { this.active = false; }

  contains(p) {
    return this.active && Math.hypot(p.x - this.x, p.y - this.y) < this.r * 2.2;
  }

  fling(vx, vy) {
    const max = 6;
    const s = Math.hypot(vx, vy);
    const k = s > max ? max / s : 1;
    this.vx = vx * k;
    this.vy = vy * k;
    this.spin = vx * 4;
  }

  hold(p) {
    this.x = p.x; this.y = p.y; this.vx = 0; this.vy = 0;
  }

  get moving() {
    return this.active && Math.hypot(this.vx, this.vy) > 0.05;
  }

  /**
   * @param {{cx:number, cy:number, R:number}} pet body circle in stage units
   * @returns {string[]} events: 'hit-pet' | 'kick' | 'bounce'
   */
  update(dt, bounds, pet, held) {
    if (!this.active) return [];
    this.t += dt;
    this.squash *= Math.exp(-12 * dt);
    if (held) return [];
    const events = [];
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;

    const floor = -this.r, left = bounds.left + this.r, right = bounds.right - this.r, top = bounds.top + 0.35;
    if (this.y > floor) {
      this.y = floor;
      if (this.vy > 0.4) { events.push('bounce'); this.squash = Math.min(0.35, this.vy * 0.08); }
      this.vy = -this.vy * BOUNCE;
      this.vx *= 0.92;
      this.spin = this.vx * 5;
      if (Math.abs(this.vy) < 0.25) this.vy = 0;
    }
    if (this.x < left) { this.x = left; this.vx = Math.abs(this.vx) * BOUNCE; }
    if (this.x > right) { this.x = right; this.vx = -Math.abs(this.vx) * BOUNCE; }
    if (this.y < top) { this.y = top; this.vy = Math.abs(this.vy) * 0.5; }

    // Collide with the pet's body (approximated by a circle).
    const dx = this.x - pet.cx, dy = this.y - pet.cy;
    const dist = Math.hypot(dx, dy);
    const minD = pet.R + this.r;
    if (dist < minD && dist > 1e-6) {
      const nx = dx / dist, ny = dy / dist;
      this.x = pet.cx + nx * minD;
      this.y = pet.cy + ny * minD;
      const vn = this.vx * nx + this.vy * ny;
      if (vn < 0) {
        this.vx -= (1 + PET_BOUNCE) * vn * nx;
        this.vy -= (1 + PET_BOUNCE) * vn * ny;
        this.vy -= 0.8; // a little "boing" upward
        if (this.t - this.lastHit > 0.35) { this.lastHit = this.t; events.push('hit-pet'); }
      }
    }

    // Ball resting near the pet? The pet bumps it back into play.
    const resting = this.y >= floor - 0.01 && Math.abs(this.vx) < 0.35;
    if (resting && Math.abs(this.x - pet.cx) < pet.R * 1.6 && this.t - this.lastHit > KICK_COOLDOWN_S) {
      this.lastHit = this.t;
      this.vx = Math.sign(this.x - pet.cx || 1) * (1 + this.rand() * 0.8);
      this.vy = -3.2 - this.rand();
      events.push('kick');
    }
    return events;
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    // contact shadow on the floor
    const h = Math.max(0, -this.y - this.r);
    ctx.save();
    ctx.translate(0, -this.y);
    ctx.scale(1, 0.25);
    ctx.fillStyle = `rgba(120,50,40,${0.18 * Math.max(0.2, 1 - h)})`;
    ctx.beginPath(); ctx.arc(0, 0, this.r * (1.1 - Math.min(0.6, h * 0.4)), 0, TAU); ctx.fill();
    ctx.restore();

    ctx.scale(1 + this.squash, 1 - this.squash);
    ctx.rotate(this.rot);
    const g = ctx.createRadialGradient(-this.r * 0.35, -this.r * 0.4, this.r * 0.1, 0, 0, this.r);
    g.addColorStop(0, '#FFF2B0');
    g.addColorStop(0.5, '#FFD15C');
    g.addColorStop(1, '#F2A93B');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(242,115,95,0.9)';
    ctx.lineWidth = this.r * 0.22;
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.98, -0.7, 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.98, Math.PI - 0.7, Math.PI + 0.7); ctx.stroke();
    ctx.restore();
  }
}
