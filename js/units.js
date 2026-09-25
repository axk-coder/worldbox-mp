class Unit {
  constructor(id, type, raceKey, x, y, ownerId, kingdomKey = 'blue', townId = null) {
    this.id = id;
    this.type = type;
    this.raceKey = raceKey || 'HUMAN';
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.ownerId = ownerId;
    this.kingdomKey = kingdomKey;
    this.townId = townId;
    this.name = `${raceKey}_${Math.floor(Math.random() * 900 + 100)}`;
    this.age = Math.floor(Math.random() * 25 + 18);
    this.kills = 0;
    this.level = 1;

    const raceInfo = CONFIG.RACES[this.raceKey] || CONFIG.RACES.HUMAN;
    const unitInfo = CONFIG.UNITS[type] || CONFIG.UNITS.INFANTRY;

    this.stats = {
      hp: raceInfo.hp + (unitInfo.hp - 100),
      speed: raceInfo.speed,
      atk: raceInfo.atk + (unitInfo.atk - 10),
      range: unitInfo.range,
      isNaval: unitInfo.isNaval
    };

    this.hp = this.stats.hp;
    this.maxHp = this.hp;
    this.isNaval = this.stats.isNaval;
    this.path = [];
    this.attackTarget = null;
    this.state = 'IDLE';
    this.harvestTimer = 0;
    this.selected = false;
  }

  setMoveTarget(tx, ty, world) {
    this.targetX = tx;
    this.targetY = ty;
    this.path = world.findPath(Math.round(this.x), Math.round(this.y), tx, ty, this.isNaval);
    this.state = 'MOVING';
  }

  update(world, gameState) {
    if (this.hp <= 0) return;

    if (this.state === 'MOVING' && this.path.length > 0) {
      const nextTile = this.path[0];
      const dx = nextTile.x - this.x;
      const dy = nextTile.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = (this.stats.speed / CONFIG.TICKS_PER_SEC);

      if (dist <= step) {
        this.x = nextTile.x;
        this.y = nextTile.y;
        this.path.shift();
        if (this.path.length === 0) {
          this.state = 'IDLE';
        }
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
      return;
    }

    if (this.attackTarget) {
      if (this.attackTarget.hp <= 0) {
        this.kills++;
        if (this.kills % 3 === 0) {
          this.level++;
          this.maxHp += 15;
          this.hp = Math.min(this.maxHp, this.hp + 15);
        }
        this.attackTarget = null;
        this.state = 'IDLE';
        return;
      }
      const dist = Math.hypot(this.attackTarget.x - this.x, this.attackTarget.y - this.y);
      if (dist <= this.stats.range) {
        this.attackTarget.hp -= this.stats.atk / CONFIG.TICKS_PER_SEC;
        this.state = 'ATTACKING';
      } else {
        this.setMoveTarget(Math.round(this.attackTarget.x), Math.round(this.attackTarget.y), world);
      }
      return;
    }

    if (this.type === 'WORKER') {
      this.updateWorkerAI(world, gameState);
      return;
    }

    this.scanForEnemies(gameState);
  }

  updateWorkerAI(world, gameState) {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    const res = world.getResource(rx, ry);
    if (res && res.amount > 0) {
      this.harvestTimer++;
      if (this.harvestTimer >= CONFIG.TICKS_PER_SEC * 1.5) {
        this.harvestTimer = 0;
        res.amount -= 10;
        const town = gameState.towns.find(t => t.id === this.townId);
        if (town) {
          town.resources[res.type] = (town.resources[res.type] || 0) + 10;
        }
      }
    } else if (this.state === 'IDLE' && Math.random() < 0.1) {
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const nx = rx + dx;
          const ny = ry + dy;
          if (world.getResource(nx, ny)) {
            this.setMoveTarget(nx, ny, world);
            return;
          }
        }
      }
    }
  }

  scanForEnemies(gameState) {
    if (this.state === 'ATTACKING') return;
    const enemies = gameState.units.filter(u => u.kingdomKey !== this.kingdomKey && u.hp > 0);
    let closest = null;
    let minDist = 10;
    for (let enemy of enemies) {
      const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (d < minDist) {
        minDist = d;
        closest = enemy;
      }
    }
    if (closest) {
      this.attackTarget = closest;
    }
  }
}
