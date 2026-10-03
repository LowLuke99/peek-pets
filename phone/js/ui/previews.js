// Live mini renders of pets (the avatar button and the pet picker). Each preview has
// its own rig so they blink independently, but they all look where the main pet looks.

import { PetRig } from '../pet/rig.js';

export class Previews {
  constructor() {
    this.items = [];
  }

  mount(canvas, species, { avatar = false } = {}) {
    const rig = new PetRig();
    rig.t = Math.random() * 10;
    rig.nextBlink = rig.t + Math.random() * 2;
    this.items = [...this.items, { canvas, ctx: canvas.getContext('2d'), species, rig, state: species.init(), avatar }];
  }

  clear({ keepAvatar = true } = {}) {
    this.items = this.items.filter((i) => keepAvatar && i.avatar);
  }

  replaceAvatar(canvas, species) {
    this.items = this.items.filter((i) => !i.avatar);
    this.mount(canvas, species, { avatar: true });
  }

  update(dt, gaze, emotion) {
    for (const item of this.items) {
      if (!item.canvas.isConnected) continue;
      const mood = emotion === 'asleep' || emotion === 'sleepy' ? emotion : item.avatar ? emotion : 'neutral';
      const pose = item.rig.update(dt, { emotion: mood, gazeTarget: gaze, source: 'cursor', reducedMotion: true });
      item.state = item.species.step(item.state, pose, dt);
      draw(item, pose);
    }
    this.items = this.items.filter((i) => i.canvas.isConnected || i.avatar);
  }
}

function draw(item, pose) {
  const { ctx, canvas, species, avatar } = item;
  const w = canvas.width, hgt = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  if (!avatar) {
    const g = ctx.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, species.palette.bgA);
    g.addColorStop(1, species.palette.bgB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
  }
  const scale = w * (avatar ? 0.82 : 0.6);
  const groundY = avatar ? hgt * 0.98 : hgt * 0.84;
  ctx.setTransform(scale, 0, 0, scale, w / 2, groundY);
  if (species.grounded) {
    ctx.translate(0, 0);
    ctx.rotate(pose.rot * 0.5);
    ctx.scale(pose.sx, pose.sy);
    ctx.translate(0, -species.groundY);
  } else {
    ctx.translate(0, -species.floatY * (avatar ? 0.75 : 1) + Math.sin(pose.t * 1.4) * 0.02);
    ctx.scale(pose.sx, pose.sy);
  }
  species.draw(ctx, { ...pose, x: 0, y: 0, hop: 0 }, item.state);
}
