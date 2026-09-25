class Projectile {
  constructor(id, type, startX, startY, targetX, targetY, ownerId) {
    this.id = id;
    this.type = type;
    this.x = startX;
    this.y = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.ownerId = ownerId;
    this.config = CONFIG.WEAPONS[type] || CONFIG.WEAPONS.BOMB;
    this.speed = 8;
    this.progress = 0;
    this.distance = Math.hypot(targetX - startX, targetY - startY);
    this.completed = false;
  }

  update(world, gameState) {
    if (this.completed) return;
    this.progress += this.speed / CONFIG.TICKS_PER_SEC;
    const ratio = Math.min(1, this.progress / Math.max(1, this.distance));
    this.x = this.x + (this.targetX - this.x) * ratio;
    this.y = this.y + (this.targetY - this.y) * ratio;

    if (ratio >= 1) {
      this.explode(world, gameState);
      this.completed = true;
    }
  }

  explode(world, gameState) {
    const isNuke = this.type === 'NUKE';
    world.applyExplosion(Math.round(this.targetX), Math.round(this.targetY), this.config.blastRadius, isNuke);

    gameState.units.forEach(u => {
      const d = Math.hypot(u.x - this.targetX, u.y - this.targetY);
      if (d <= this.config.blastRadius) {
        u.hp -= this.config.damage * (1 - d / (this.config.blastRadius + 1));
      }
    });

    gameState.towns.forEach(t => {
      t.buildings.forEach(b => {
        const d = Math.hypot(b.x - this.targetX, b.y - this.targetY);
        if (d <= this.config.blastRadius) {
          b.hp -= this.config.damage * (1 - d / (this.config.blastRadius + 1));
        }
      });
      t.buildings = t.buildings.filter(b => b.hp > 0);
    });

    gameState.addExplosionFx(this.targetX, this.targetY, this.config.blastRadius, isNuke);
  }
}
