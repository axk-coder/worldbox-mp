class Unit {
  constructor(id, type, raceKey, x, y, ownerId, kingdomKey = 'blue', townId = null, initialAge = null, initialJob = null) {
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

    this.age = initialAge !== null ? initialAge : 0;
    this.ageTimer = 0;
    this.job = initialJob || (this.age < 18 ? 'CHILD' : this.assignJob());
    this.mateCooldown = Math.floor(Math.random() * 100);

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
    this.harvestTargetRes = null;
    this.carryingWood = 0;
    this.hasBuildingWood = false;
    this.selected = false;
  }

  assignJob(town = null) {
    if (this.isNaval) {
      return 'SAILOR';
    }
    if (this.type === 'INFANTRY' || this.type === 'ARCHER') {
      return 'ARMY_MAN';
    }

    const availableJobs = ['TREE_CHOPPER', 'MINER', 'HOUSE_BUILDER', 'ARMY_MAN'];
    if (town) {
      const unbuilt = town.buildings.filter(b => !b.isCompleted).length;
      if (unbuilt > 0 && Math.random() < 0.4) {
        return 'HOUSE_BUILDER';
      }
    }
    return availableJobs[Math.floor(Math.random() * availableJobs.length)];
  }

  setMoveTarget(tx, ty, world) {
    if (!world.isPassable(tx, ty, this.isNaval)) return;
    this.targetX = tx;
    this.targetY = ty;
    this.path = world.findPath(Math.round(this.x), Math.round(this.y), tx, ty, this.isNaval);
    this.state = 'MOVING';
  }

  update(world, gameState) {
    if (this.hp <= 0) {
      this.releaseClaim();
      return;
    }

    if (this.mateCooldown > 0) {
      this.mateCooldown--;
    }

    this.ageTimer += 1 / CONFIG.TICKS_PER_SEC;
    if (this.ageTimer >= 10) {
      this.ageTimer = 0;
      this.age++;
      if (this.age >= 18 && this.job === 'CHILD') {
        const town = gameState.towns.find(t => t.id === this.townId);
        this.job = this.assignJob(town);
      }
    }

    if (this.age >= 18 && this.mateCooldown <= 0) {
      this.tryMate(gameState);
    }

    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    if (!world.isPassable(rx, ry, this.isNaval)) {
      if (!this.isNaval) {
        this.hp -= 15 / CONFIG.TICKS_PER_SEC;
      }
    }

    if (this.state === 'MOVING' && this.path.length > 0) {
      const nextTile = this.path[0];
      if (!world.isPassable(nextTile.x, nextTile.y, this.isNaval)) {
        this.path = [];
        this.state = 'IDLE';
        this.releaseClaim();
        return;
      }

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

    if (this.job === 'CHILD') {
      this.updateChildAI(world, gameState);
      return;
    }

    if (this.job === 'ARMY_MAN' || this.type === 'INFANTRY' || this.type === 'ARCHER') {
      this.updateArmyManAI(world, gameState);
      return;
    }

    if (this.job === 'HOUSE_BUILDER') {
      this.updateHouseBuilderAI(world, gameState);
      return;
    }

    if (this.job === 'TREE_CHOPPER') {
      this.updateTreeChopperAI(world, gameState);
      return;
    }

    if (this.job === 'MINER') {
      this.updateMinerAI(world, gameState);
      return;
    }
  }

  tryMate(gameState) {
    if (this.mateCooldown > 0 || this.age < 18 || this.isNaval) return;

    const town = gameState.towns.find(t => t.id === this.townId || t.kingdomKey === this.kingdomKey);
    if (!town) return;

    const completedHouses = town.buildings.filter(b => b.type === 'HOUSE' && b.isCompleted).length;
    if (completedHouses < 1) return;

    const totalPop = gameState.getTownUnitsCount(town.id);
    if (totalPop >= completedHouses * 4) return;

    if (town.resources.food < 12) return;

    let partner = null;
    if (gameState.spatialGrid) {
      const candidates = gameState.spatialGrid.getUnitsInRadius(this.x, this.y, 2.2);
      partner = candidates.find(u =>
        u.id !== this.id &&
        u.kingdomKey === this.kingdomKey &&
        u.raceKey === this.raceKey &&
        u.age >= 18 &&
        !u.isNaval &&
        u.mateCooldown <= 0
      );
    } else {
      partner = gameState.units.find(u =>
        u.id !== this.id &&
        u.kingdomKey === this.kingdomKey &&
        u.raceKey === this.raceKey &&
        u.age >= 18 &&
        !u.isNaval &&
        u.mateCooldown <= 0 &&
        Math.hypot(u.x - this.x, u.y - this.y) <= 2.2
      );
    }

    if (partner) {
      town.resources.food -= 12;
      this.mateCooldown = CONFIG.TICKS_PER_SEC * 30;
      partner.mateCooldown = CONFIG.TICKS_PER_SEC * 30;

      const babyX = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, (this.x + partner.x) / 2));
      const babyY = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, (this.y + partner.y) / 2));

      gameState.spawnUnit('WORKER', this.raceKey, babyX, babyY, this.ownerId, this.kingdomKey, town.id, 0, 'CHILD');
    }
  }

  updateChildAI(world, gameState) {
    if (this.state === 'IDLE' && Math.random() < 0.08) {
      const town = gameState.towns.find(t => t.id === this.townId);
      const centerX = town ? town.x : this.x;
      const centerY = town ? town.y : this.y;
      const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(centerX + (Math.random() - 0.5) * 6)));
      const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(centerY + (Math.random() - 0.5) * 6)));
      this.setMoveTarget(nx, ny, world);
    }
  }

  updateArmyManAI(world, gameState) {
    this.scanForEnemies(gameState);
    if (this.state === 'IDLE' && Math.random() < 0.06) {
      const town = gameState.towns.find(t => t.id === this.townId);
      const centerX = town ? town.x : this.x;
      const centerY = town ? town.y : this.y;
      const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(centerX + (Math.random() - 0.5) * 12)));
      const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(centerY + (Math.random() - 0.5) * 12)));
      this.setMoveTarget(nx, ny, world);
    }
  }

  releaseClaim() {
    if (this.harvestTargetRes && this.harvestTargetRes.claimedBy === this.id) {
      this.harvestTargetRes.claimedBy = null;
      this.harvestTargetRes = null;
    }
  }

  updateHouseBuilderAI(world, gameState) {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    const town = gameState.towns.find(t => t.id === this.townId || t.kingdomKey === this.kingdomKey);

    if (!town) {
      if (this.state === 'IDLE' && Math.random() < 0.05) {
        this.setMoveTarget(Math.round(this.x + (Math.random() - 0.5) * 6), Math.round(this.y + (Math.random() - 0.5) * 6), world);
      }
      return;
    }

    const stockpile = town.buildings.find(b => b.type === 'STOCKPILE' && b.isCompleted) || town.buildings.find(b => b.type === 'TOWN_HALL');
    const unbuilt = town.buildings.find(b => !b.isCompleted);

    if (unbuilt) {
      this.releaseClaim();
      if (!this.hasBuildingWood) {
        if (stockpile) {
          const distToStock = Math.hypot(stockpile.x - this.x, stockpile.y - this.y);
          if (distToStock <= 1.2) {
            if (town.resources.wood >= 10) {
              town.resources.wood -= 10;
              this.hasBuildingWood = true;
              this.setMoveTarget(unbuilt.x, unbuilt.y, world);
            }
          } else if (this.state === 'IDLE' || Math.random() < 0.08) {
            this.setMoveTarget(stockpile.x, stockpile.y, world);
          }
        }
        return;
      }

      const distToSite = Math.hypot(unbuilt.x - this.x, unbuilt.y - this.y);
      if (distToSite <= 1.2) {
        unbuilt.constructTick(25);
        this.hasBuildingWood = false;
        this.state = 'BUILDING';
      } else if (this.state === 'IDLE' || Math.random() < 0.08) {
        this.setMoveTarget(unbuilt.x, unbuilt.y, world);
      }
      return;
    }

    if (town.resources.wood >= 20 && Math.random() < 0.05 && town.buildings.length < 15) {
      const spot = town.findBuildSpot(world);
      if (spot) {
        let bType = 'HOUSE';
        const houseCount = town.buildings.filter(b => b.type === 'HOUSE').length;
        const barracksCount = town.buildings.filter(b => b.type === 'BARRACKS').length;
        if (houseCount >= 2 && barracksCount === 0 && town.resources.stone >= 25) {
          bType = 'BARRACKS';
          town.resources.stone -= 25;
        }
        town.resources.wood -= 20;
        town.addBuilding(bType, spot.x, spot.y);
        town.expandTerritory(spot.x, spot.y, 3);
        if (stockpile) {
          this.setMoveTarget(stockpile.x, stockpile.y, world);
        } else {
          this.setMoveTarget(spot.x, spot.y, world);
        }
        return;
      }
    }

    if (this.state === 'IDLE' && Math.random() < 0.06) {
      const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(town.x + (Math.random() - 0.5) * 8)));
      const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(town.y + (Math.random() - 0.5) * 8)));
      this.setMoveTarget(nx, ny, world);
    }
  }

  updateTreeChopperAI(world, gameState) {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    const town = gameState.towns.find(t => t.id === this.townId || t.kingdomKey === this.kingdomKey);
    const stockpile = town ? (town.buildings.find(b => b.type === 'STOCKPILE' && b.isCompleted) || town.buildings.find(b => b.type === 'TOWN_HALL')) : null;

    if (this.carryingWood >= 10 && stockpile) {
      this.releaseClaim();
      const dist = Math.hypot(stockpile.x - this.x, stockpile.y - this.y);
      if (dist <= 1.2) {
        if (town) {
          town.resources.wood = (town.resources.wood || 0) + this.carryingWood;
        }
        this.carryingWood = 0;
        this.state = 'IDLE';
      } else if (this.state === 'IDLE' || Math.random() < 0.08) {
        this.setMoveTarget(stockpile.x, stockpile.y, world);
      }
      return;
    }

    const res = world.getResource(rx, ry);
    if (res && res.type === CONFIG.RESOURCES.WOOD && res.amount > 0 && (!res.claimedBy || res.claimedBy === this.id)) {
      res.claimedBy = this.id;
      this.harvestTargetRes = res;
      this.harvestTimer++;
      this.state = 'CHOPPING';

      if (this.harvestTimer % 5 === 0) {
        gameState.addChopFx(rx, ry);
      }

      if (this.harvestTimer >= CONFIG.TICKS_PER_SEC * 1.5) {
        this.harvestTimer = 0;
        res.amount -= 10;
        this.carryingWood += 10;
        if (res.amount <= 0) {
          res.claimedBy = null;
          this.harvestTargetRes = null;
          world.setTile(rx, ry, CONFIG.TILES.GRASS);
        }
        if (stockpile) {
          this.setMoveTarget(stockpile.x, stockpile.y, world);
        }
      }
    } else {
      this.releaseClaim();
      if (this.state === 'IDLE' && Math.random() < 0.15) {
        for (let dy = -6; dy <= 6; dy++) {
          for (let dx = -6; dx <= 6; dx++) {
            const nx = rx + dx;
            const ny = ry + dy;
            if (nx >= 0 && nx < CONFIG.WORLD_WIDTH && ny >= 0 && ny < CONFIG.WORLD_HEIGHT) {
              const targetRes = world.getResource(nx, ny);
              const tile = world.getTile(nx, ny);
              if ((tile === CONFIG.TILES.FOREST || (targetRes && targetRes.type === CONFIG.RESOURCES.WOOD)) && targetRes && targetRes.amount > 0 && !targetRes.claimedBy && world.isPassable(nx, ny, false)) {
                targetRes.claimedBy = this.id;
                this.harvestTargetRes = targetRes;
                this.setMoveTarget(nx, ny, world);
                return;
              }
            }
          }
        }
      }
    }
  }

  updateMinerAI(world, gameState) {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    const town = gameState.towns.find(t => t.id === this.townId || t.kingdomKey === this.kingdomKey);

    const res = world.getResource(rx, ry);
    if (res && res.type === CONFIG.RESOURCES.STONE && res.amount > 0 && (!res.claimedBy || res.claimedBy === this.id)) {
      res.claimedBy = this.id;
      this.harvestTargetRes = res;
      this.harvestTimer++;
      this.state = 'MINING';

      if (this.harvestTimer % 5 === 0) {
        gameState.addChopFx(rx, ry);
      }

      if (this.harvestTimer >= CONFIG.TICKS_PER_SEC * 1.5) {
        this.harvestTimer = 0;
        res.amount -= 10;
        if (town) {
          town.resources.stone = (town.resources.stone || 0) + 10;
        }
        if (res.amount <= 0) {
          res.claimedBy = null;
          this.harvestTargetRes = null;
          world.setTile(rx, ry, CONFIG.TILES.GRASS);
        }
      }
    } else {
      this.releaseClaim();
      if (this.state === 'IDLE' && Math.random() < 0.15) {
        for (let dy = -6; dy <= 6; dy++) {
          for (let dx = -6; dx <= 6; dx++) {
            const nx = rx + dx;
            const ny = ry + dy;
            if (nx >= 0 && nx < CONFIG.WORLD_WIDTH && ny >= 0 && ny < CONFIG.WORLD_HEIGHT) {
              const targetRes = world.getResource(nx, ny);
              const tile = world.getTile(nx, ny);
              if ((tile === CONFIG.TILES.MOUNTAIN || (targetRes && targetRes.type === CONFIG.RESOURCES.STONE)) && targetRes && targetRes.amount > 0 && !targetRes.claimedBy && world.isPassable(nx, ny, false)) {
                targetRes.claimedBy = this.id;
                this.harvestTargetRes = targetRes;
                this.setMoveTarget(nx, ny, world);
                return;
              }
            }
          }
        }
      }
    }
  }

  scanForEnemies(gameState) {
    if (this.state === 'ATTACKING') return;
    const closest = gameState.spatialGrid ? gameState.spatialGrid.findClosestEnemy(this, 10) : null;
    if (closest) {
      this.attackTarget = closest;
    }
  }
}
