class Unit {
  constructor(id, type, raceKey, x, y, ownerId, kingdomKey = 'blue', townId = null, initialAge = null, initialJob = null) {
    this.id = id;
    this.type = type;
    this.raceKey = raceKey || 'HUMAN';
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.targetSnapX = x;
    this.targetSnapY = y;
    this.ownerId = ownerId;
    this.kingdomKey = kingdomKey;
    this.townId = townId;
    this.name = `${raceKey}_${Math.floor(CONFIG.prng.random() * 900 + 100)}`;

    this.age = initialAge !== null ? initialAge : 0;
    this.ageTimer = 0;
    this.job = initialJob || (this.age < 18 ? 'CHILD' : this.assignJob());
    this.mateCooldown = Math.floor(CONFIG.prng.random() * 100);

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
    this.carryingStone = 0;
    this.carryingGold = 0;
    this.carryingIron = 0;
    this.carryingFood = 0;
    this.hasBuildingWood = false;
    this.selected = false;
    this.targetSpot = null;
    this.siegeTimer = 0;
    this.siegeDuration = 0;
    this.siegeTargetTownId = null;
  }

  assignJob(town = null) {
    if (this.isNaval) {
      return this.type === 'FISHING_BOAT' ? 'FISHERMAN' : 'SAILOR';
    }
    if (this.type === 'INFANTRY' || this.type === 'ARCHER') {
      return 'ARMY_MAN';
    }

    const availableJobs = ['TREE_CHOPPER', 'MINER', 'HOUSE_BUILDER', 'ARMY_MAN'];
    if (town) {
      const unbuilt = town.buildings.filter(b => !b.isCompleted || b.isRuined || b.hp < b.maxHp).length;
      if (unbuilt > 0 && CONFIG.prng.random() < 0.5) {
        return 'HOUSE_BUILDER';
      }
    }
    return availableJobs[Math.floor(CONFIG.prng.random() * availableJobs.length)];
  }

  setMoveTarget(tx, ty, world) {
    let targetX = tx;
    let targetY = ty;
    if (!world.isPassable(targetX, targetY, this.isNaval)) {
      const near = world.findNearestPassableTile ? world.findNearestPassableTile(tx, ty, this.isNaval) : null;
      if (near) {
        targetX = near.x;
        targetY = near.y;
      } else {
        return;
      }
    }
    this.targetX = targetX;
    this.targetY = targetY;
    this.path = world.findPath(Math.round(this.x), Math.round(this.y), targetX, targetY, this.isNaval);
    if (this.path.length === 0 && (Math.round(this.x) !== targetX || Math.round(this.y) !== targetY)) {
      if (this.job === 'CITY_STARTER') {
        this.targetSpot = null;
      }
    }
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

    if (this.age >= 18 && !this.isNaval && this.job !== 'CITY_STARTER' && this.job !== 'PRINCE' && this.townId) {
      const town = gameState.towns.find(t => t.id === this.townId);
      if (town && (town.resources.food || 0) >= 100) {
        const currentPop = gameState.getTownUnitsCount(town.id);
        if (currentPop >= 8) {
          const activeStarter = gameState.units.some(u => u.townId === town.id && u.job === 'CITY_STARTER' && u.hp > 0);
          if (!activeStarter) {
            this.job = 'CITY_STARTER';
            town.cityStarterDispatched = true;
          }
        }
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

    if (this.job === 'CITY_STARTER') {
      this.updateCityStarterAI(world, gameState);
      return;
    }

    if (this.job === 'PRINCE') {
      this.updatePrinceAI(world, gameState);
      return;
    }

    if (this.job === 'FISHERMAN') {
      this.updateFishermanAI(world, gameState);
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
    if (!town || town.isRuined) return;

    const housingCapacity = town.getTotalHousingCapacity();
    if (housingCapacity < 1) return;

    const totalPop = gameState.getTownUnitsCount(town.id);
    if (totalPop >= housingCapacity) return;

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
    if (this.state === 'IDLE' && CONFIG.prng.random() < 0.08) {
      const town = gameState.towns.find(t => t.id === this.townId);
      const centerX = town ? town.x : this.x;
      const centerY = town ? town.y : this.y;
      const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(centerX + (CONFIG.prng.random() - 0.5) * 6)));
      const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(centerY + (CONFIG.prng.random() - 0.5) * 6)));
      this.setMoveTarget(nx, ny, world);
    }
  }

  updateCityStarterAI(world, gameState) {
    const oldTown = gameState.towns.find(t => t.id === this.townId);
    const wWidth = world ? world.width : CONFIG.WORLD_WIDTH;
    const wHeight = world ? world.height : CONFIG.WORLD_HEIGHT;

    if (!this.targetSpot) {
      const originX = oldTown ? oldTown.x : Math.round(this.x);
      const originY = oldTown ? oldTown.y : Math.round(this.y);
      let foundSpot = null;

      for (let radius = 12; radius <= 44; radius += 4) {
        const angleOffset = CONFIG.prng.random() * Math.PI * 2;
        for (let i = 0; i < 16; i++) {
          const angle = angleOffset + (i / 16) * Math.PI * 2;
          const randX = Math.round(originX + Math.cos(angle) * radius);
          const randY = Math.round(originY + Math.sin(angle) * radius);

          if (randX >= 10 && randX < wWidth - 10 && randY >= 10 && randY < wHeight - 10) {
            if (world.isPassable(randX, randY, false)) {
              const farEnough = gameState.towns.every(t => Math.hypot(t.x - randX, t.y - randY) >= 10);
              if (farEnough) {
                const testPath = world.findPath(Math.round(this.x), Math.round(this.y), randX, randY, false);
                if (testPath && testPath.length > 0) {
                  foundSpot = { x: randX, y: randY };
                  break;
                }
              }
            }
          }
        }
        if (foundSpot) break;
      }

      if (!foundSpot) {
        for (let minRadius = 18; minRadius >= 8; minRadius -= 4) {
          for (let attempts = 0; attempts < 30; attempts++) {
            const margin = Math.min(12, Math.floor(wWidth * 0.1));
            const randX = Math.floor(margin + CONFIG.prng.random() * Math.max(1, wWidth - margin * 2));
            const randY = Math.floor(margin + CONFIG.prng.random() * Math.max(1, wHeight - margin * 2));
            if (world.isPassable(randX, randY, false)) {
              const farEnough = gameState.towns.every(t => Math.hypot(t.x - randX, t.y - randY) >= minRadius);
              if (farEnough) {
                const testPath = world.findPath(Math.round(this.x), Math.round(this.y), randX, randY, false);
                if (testPath && testPath.length > 0) {
                  foundSpot = { x: randX, y: randY };
                  break;
                }
              }
            }
          }
          if (foundSpot) break;
        }
      }

      if (foundSpot) {
        this.targetSpot = foundSpot;
        this.setMoveTarget(foundSpot.x, foundSpot.y, world);
      } else if (oldTown) {
        oldTown.cityStarterDispatched = false;
      }
      return;
    }

    const dist = Math.hypot(this.x - this.targetSpot.x, this.y - this.targetSpot.y);
    if (dist <= 1.8) {
      let woodTaken = 10;
      let foodTaken = 20;
      let stoneTaken = 5;
      let goldTaken = 0;
      let ironTaken = 0;
      if (oldTown) {
        woodTaken = Math.floor((oldTown.resources.wood || 0) * 0.25);
        foodTaken = Math.floor((oldTown.resources.food || 0) * 0.25);
        stoneTaken = Math.floor((oldTown.resources.stone || 0) * 0.25);
        goldTaken = Math.floor((oldTown.resources.gold || 0) * 0.25);
        ironTaken = Math.floor((oldTown.resources.iron || 0) * 0.25);

        oldTown.resources.wood -= woodTaken;
        oldTown.resources.food -= foodTaken;
        oldTown.resources.stone -= stoneTaken;
        oldTown.resources.gold -= goldTaken;
        oldTown.resources.iron -= ironTaken;
        oldTown.cityStarterDispatched = false;
      }

      const newTown = gameState.spawnKingdom(this.raceKey, null, Math.round(this.x), Math.round(this.y), this.kingdomKey);
      if (newTown) {
        newTown.resources.wood = (newTown.resources.wood || 0) + woodTaken;
        newTown.resources.food = (newTown.resources.food || 0) + foodTaken;
        newTown.resources.stone = (newTown.resources.stone || 0) + stoneTaken;
        newTown.resources.gold = (newTown.resources.gold || 0) + goldTaken;
        newTown.resources.iron = (newTown.resources.iron || 0) + ironTaken;
        this.townId = newTown.id;
        this.job = 'PRINCE';
        this.state = 'IDLE';
        newTown.leader = this;

        if (oldTown) {
          const totalPop = gameState.getTownUnitsCount(oldTown.id);
          const countToTransfer = Math.floor(totalPop * 0.25);
          const colonists = gameState.units.filter(u => u.townId === oldTown.id && u.id !== this.id && u.hp > 0 && !u.isNaval);
          for (let i = 0; i < Math.min(countToTransfer, colonists.length); i++) {
            colonists[i].townId = newTown.id;
            colonists[i].setMoveTarget(newTown.x, newTown.y, world);
          }
        }
      } else {
        this.targetSpot = null;
        if (oldTown) oldTown.cityStarterDispatched = false;
      }
    } else if (this.state === 'IDLE') {
      this.setMoveTarget(this.targetSpot.x, this.targetSpot.y, world);
    }
  }

  updatePrinceAI(world, gameState) {
    const town = gameState.towns.find(t => t.id === this.townId);
    if (town) {
      town.leader = this;
    }

    if (this.state === 'IDLE' && CONFIG.prng.random() < 0.05) {
      const centerX = town ? town.x : this.x;
      const centerY = town ? town.y : this.y;
      const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(centerX + (CONFIG.prng.random() - 0.5) * 4)));
      const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(centerY + (CONFIG.prng.random() - 0.5) * 4)));
      this.setMoveTarget(nx, ny, world);
    }

    this.scanForEnemies(gameState);
  }

  updateFishermanAI(world, gameState) {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    const wWidth = world ? world.width : CONFIG.WORLD_WIDTH;
    const wHeight = world ? world.height : CONFIG.WORLD_HEIGHT;
    const town = gameState.towns.find(t => t.id === this.townId || t.kingdomKey === this.kingdomKey);
    const dock = town ? town.buildings.find(b => b.type === 'DOCK' && b.isCompleted && !b.isRuined) : null;
    const stockpile = town ? (town.buildings.find(b => (b.type === 'STOCKPILE' || b.type === 'TOWN_HALL') && b.isCompleted && !b.isRuined) || town.buildings.find(b => !b.isRuined)) : null;

    if (this.carryingFood >= 15 && (dock || stockpile || town)) {
      this.releaseClaim();
      const targetBuilding = dock || stockpile || town;
      const targetX = targetBuilding.x;
      const targetY = targetBuilding.y;
      const dist = Math.hypot(targetX - this.x, targetY - this.y);

      if (dist <= 2.8) {
        if (town) {
          town.resources.food = (town.resources.food || 0) + this.carryingFood;
        }
        this.carryingFood = 0;
        this.state = 'IDLE';
        this.path = [];
      } else if (this.state !== 'MOVING' || this.path.length === 0) {
        let navTargetX = targetX;
        let navTargetY = targetY;
        if (this.isNaval && !world.isPassable(targetX, targetY, true)) {
          const waterSpot = world.findWaterNear ? world.findWaterNear(targetX, targetY) : (town ? town.findWaterNear(targetX, targetY, world) : null);
          if (waterSpot) {
            navTargetX = waterSpot.x;
            navTargetY = waterSpot.y;
          }
        }
        this.setMoveTarget(navTargetX, navTargetY, world);
      }
      return;
    }

    const res = world.getResource(rx, ry);
    if (res && res.type === CONFIG.RESOURCES.FOOD && res.amount > 0 && (!res.claimedBy || res.claimedBy === this.id)) {
      res.claimedBy = this.id;
      this.harvestTargetRes = res;
      this.harvestTimer++;
      this.state = 'FISHING';
      if (this.harvestTimer >= CONFIG.TICKS_PER_SEC * 1.5) {
        this.harvestTimer = 0;
        const take = Math.min(15 - this.carryingFood, res.amount);
        res.amount -= take;
        this.carryingFood += take;
        if (res.amount <= 0) {
          res.claimedBy = null;
          this.harvestTargetRes = null;
          const idx = ry * wWidth + rx;
          world.resources[idx] = null;
        }
        const targetBuilding = dock || stockpile || town;
        if (targetBuilding) {
          let navTargetX = targetBuilding.x;
          let navTargetY = targetBuilding.y;
          if (this.isNaval && !world.isPassable(navTargetX, navTargetY, true)) {
            const waterSpot = world.findWaterNear ? world.findWaterNear(navTargetX, navTargetY) : (town ? town.findWaterNear(navTargetX, navTargetY, world) : null);
            if (waterSpot) {
              navTargetX = waterSpot.x;
              navTargetY = waterSpot.y;
            }
          }
          this.setMoveTarget(navTargetX, navTargetY, world);
        }
      }
      return;
    }

    const tile = world.getTile(rx, ry);
    if (tile === CONFIG.TILES.DEEP_WATER || tile === CONFIG.TILES.SHALLOW_WATER) {
      if (this.carryingFood < 15) {
        this.harvestTimer++;
        this.state = 'FISHING';
        if (this.harvestTimer >= CONFIG.TICKS_PER_SEC * 1.5) {
          this.harvestTimer = 0;
          this.carryingFood += 15;
          const targetBuilding = dock || stockpile || town;
          if (targetBuilding) {
            let navTargetX = targetBuilding.x;
            let navTargetY = targetBuilding.y;
            if (this.isNaval && !world.isPassable(navTargetX, navTargetY, true)) {
              const waterSpot = world.findWaterNear ? world.findWaterNear(navTargetX, navTargetY) : (town ? town.findWaterNear(navTargetX, navTargetY, world) : null);
              if (waterSpot) {
                navTargetX = waterSpot.x;
                navTargetY = waterSpot.y;
              }
            }
            this.setMoveTarget(navTargetX, navTargetY, world);
          }
        }
        return;
      }
    }

    this.releaseClaim();
    if (this.state === 'IDLE' && CONFIG.prng.random() < 0.15) {
      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10; dx <= 10; dx++) {
          const nx = rx + dx;
          const ny = ry + dy;
          if (nx >= 0 && nx < wWidth && ny >= 0 && ny < wHeight) {
            const targetRes = world.getResource(nx, ny);
            if (targetRes && targetRes.type === CONFIG.RESOURCES.FOOD && targetRes.amount > 0 && !targetRes.claimedBy && world.isPassable(nx, ny, true)) {
              targetRes.claimedBy = this.id;
              this.harvestTargetRes = targetRes;
              this.setMoveTarget(nx, ny, world);
              return;
            }
          }
        }
      }
      for (let attempts = 0; attempts < 10; attempts++) {
        const nx = Math.max(0, Math.min(wWidth - 1, Math.round(this.x + (CONFIG.prng.random() - 0.5) * 12)));
        const ny = Math.max(0, Math.min(wHeight - 1, Math.round(this.y + (CONFIG.prng.random() - 0.5) * 12)));
        if (world.isPassable(nx, ny, true)) {
          this.setMoveTarget(nx, ny, world);
          break;
        }
      }
    }
  }

  updateArmyManAI(world, gameState) {
    this.scanForEnemies(gameState);

    const enemyTowns = gameState.towns.filter(t => !t.isRuined && t.kingdomKey !== this.kingdomKey && (gameState.isAtWar ? gameState.isAtWar(this.kingdomKey, t.kingdomKey) : true));
    let besiegingTown = null;

    for (let i = 0; i < enemyTowns.length; i++) {
      const t = enemyTowns[i];
      const centers = t.buildings.filter(b => b.type === 'TOWN_HALL' || b.type === 'STOCKPILE');
      if (centers.length === 0) centers.push({ x: t.x, y: t.y });
      if (centers.some(c => Math.hypot(c.x - this.x, c.y - this.y) <= 4.0)) {
        besiegingTown = t;
        break;
      }
    }

    if (besiegingTown) {
      this.siegeTargetTownId = besiegingTown.id;
      this.siegeTimer = besiegingTown.siegeTimer;
      this.siegeDuration = besiegingTown.siegeDuration;
      this.state = 'BESIEGING';
    } else {
      if (this.siegeTargetTownId) {
        this.siegeTargetTownId = null;
        this.siegeTimer = 0;
        this.siegeDuration = 0;
        if (this.state === 'BESIEGING') this.state = 'IDLE';
      }
    }

    if (this.state === 'IDLE' && CONFIG.prng.random() < 0.08) {
      let targetPos = null;
      if (enemyTowns.length > 0 && CONFIG.prng.random() < 0.5) {
        const t = enemyTowns[Math.floor(CONFIG.prng.random() * enemyTowns.length)];
        const center = t.buildings.find(b => b.type === 'TOWN_HALL' || b.type === 'STOCKPILE') || t;
        targetPos = { x: center.x, y: center.y };
      } else {
        const town = gameState.towns.find(t => t.id === this.townId);
        targetPos = { x: town ? town.x : this.x, y: town ? town.y : this.y };
      }
      const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(targetPos.x + (CONFIG.prng.random() - 0.5) * 12)));
      const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(targetPos.y + (CONFIG.prng.random() - 0.5) * 12)));
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

    if (!town || town.isRuined) {
      if (this.state === 'IDLE' && CONFIG.prng.random() < 0.05) {
        this.setMoveTarget(Math.round(this.x + (CONFIG.prng.random() - 0.5) * 6), Math.round(this.y + (CONFIG.prng.random() - 0.5) * 6), world);
      }
      return;
    }

    const stockpile = town.buildings.find(b => b.type === 'STOCKPILE' && b.isCompleted && !b.isRuined) || town.buildings.find(b => (b.type === 'TOWN_HALL' || b.type === 'HOUSE') && !b.isRuined);
    let targetBuilding = town.buildings.find(b => !b.isCompleted || b.isRuined || b.hp < b.maxHp);

    if (!targetBuilding) {
      for (let i = 0; i < gameState.towns.length; i++) {
        const otherTown = gameState.towns[i];
        if (otherTown.isRuined) {
          for (let j = otherTown.buildings.length - 1; j >= 0; j--) {
            const rb = otherTown.buildings[j];
            if (Math.hypot(rb.x - this.x, rb.y - this.y) <= 16) {
              rb.ownerId = town.ownerId;
              rb.kingdomKey = town.kingdomKey;
              rb.isRuined = true;
              town.buildings.push(rb);
              otherTown.buildings.splice(j, 1);
              targetBuilding = rb;
              break;
            }
          }
          if (targetBuilding) break;
        }
      }
    }

    if (targetBuilding) {
      this.releaseClaim();
      if (!this.hasBuildingWood) {
        if (stockpile) {
          const distToStock = Math.hypot(stockpile.x - this.x, stockpile.y - this.y);
          if (distToStock <= 1.2) {
            if (town.resources.wood >= 10) {
              town.resources.wood -= 10;
              this.hasBuildingWood = true;
              this.setMoveTarget(targetBuilding.x, targetBuilding.y, world);
            }
          } else if (this.state === 'IDLE' || CONFIG.prng.random() < 0.08) {
            this.setMoveTarget(stockpile.x, stockpile.y, world);
          }
        }
        return;
      }

      const distToSite = Math.hypot(targetBuilding.x - this.x, targetBuilding.y - this.y);
      if (distToSite <= 1.2) {
        if (!targetBuilding.isCompleted) {
          targetBuilding.constructTick(25);
        }
        if (targetBuilding.isRuined || targetBuilding.hp < targetBuilding.maxHp) {
          targetBuilding.hp = Math.min(targetBuilding.maxHp, targetBuilding.hp + 25);
          if (targetBuilding.hp >= targetBuilding.maxHp) {
            targetBuilding.isRuined = false;
            targetBuilding.isCompleted = true;
            targetBuilding.progress = 100;
          }
        }
        this.hasBuildingWood = false;
        this.state = 'BUILDING';
      } else if (this.state === 'IDLE' || CONFIG.prng.random() < 0.08) {
        this.setMoveTarget(targetBuilding.x, targetBuilding.y, world);
      }
      return;
    }

    const upgradable = town.buildings.find(b => b.isHouse && b.isCompleted && !b.isRuined && b.tier < CONFIG.HOUSE_TIERS.length - 1);
    if (upgradable) {
      const nextTier = CONFIG.HOUSE_TIERS[upgradable.tier + 1];
      if (town.resources.wood >= nextTier.cost.wood && (town.resources.stone || 0) >= nextTier.cost.stone) {
        this.releaseClaim();
        const distToSite = Math.hypot(upgradable.x - this.x, upgradable.y - this.y);
        if (distToSite <= 1.2) {
          town.resources.wood -= nextTier.cost.wood;
          town.resources.stone = (town.resources.stone || 0) - nextTier.cost.stone;
          upgradable.upgradeTier();
          this.state = 'BUILDING';
        } else if (this.state === 'IDLE' || CONFIG.prng.random() < 0.08) {
          this.setMoveTarget(upgradable.x, upgradable.y, world);
        }
        return;
      }
    }

    if (town.resources.wood >= 10 && CONFIG.prng.random() < 0.05 && town.buildings.length < 15) {
      const spot = town.findBuildSpot(world);
      if (spot) {
        let bType = (town.resources.wood < 20 || CONFIG.prng.random() < 0.5) ? 'TENT' : 'SMALL_HOUSE';
        const houseCount = town.buildings.filter(b => b.isHouse).length;
        const barracksCount = town.buildings.filter(b => b.type === 'BARRACKS').length;
        if (houseCount >= 2 && barracksCount === 0 && (town.resources.stone || 0) >= 25) {
          bType = 'BARRACKS';
          town.resources.stone -= 25;
          town.resources.wood -= 20;
        } else {
          const woodCost = CONFIG.BUILDINGS[bType] ? CONFIG.BUILDINGS[bType].cost.wood : 10;
          town.resources.wood -= woodCost;
        }
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

    if (this.state === 'IDLE' && CONFIG.prng.random() < 0.06) {
      const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(town.x + (CONFIG.prng.random() - 0.5) * 8)));
      const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(town.y + (CONFIG.prng.random() - 0.5) * 8)));
      this.setMoveTarget(nx, ny, world);
    }
  }

  updateTreeChopperAI(world, gameState) {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    const town = gameState.towns.find(t => t.id === this.townId || t.kingdomKey === this.kingdomKey);
    const stockpile = town ? (town.buildings.find(b => (b.type === 'STOCKPILE' || b.type === 'TOWN_HALL') && b.isCompleted && !b.isRuined) || town.buildings.find(b => !b.isRuined)) : null;

    if ((this.carryingWood >= 10 || (this.carryingWood > 0 && !this.harvestTargetRes)) && stockpile) {
      this.releaseClaim();
      const dist = Math.hypot(stockpile.x - this.x, stockpile.y - this.y);
      if (dist <= 1.2) {
        if (town) {
          town.resources.wood = (town.resources.wood || 0) + this.carryingWood;
        }
        this.carryingWood = 0;
        this.state = 'IDLE';
        this.path = [];
      } else if (this.state !== 'MOVING' || this.path.length === 0) {
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
        const harvestAmt = Math.min(10, res.amount);
        res.amount -= harvestAmt;
        this.carryingWood += harvestAmt;
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
      if (this.state === 'IDLE' && CONFIG.prng.random() < 0.15) {
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
      if (this.state === 'IDLE' && CONFIG.prng.random() < 0.08) {
        const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(this.x + (CONFIG.prng.random() - 0.5) * 10)));
        const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(this.y + (CONFIG.prng.random() - 0.5) * 10)));
        if (world.isPassable(nx, ny, false)) {
          this.setMoveTarget(nx, ny, world);
        }
      }
    }
  }

  updateMinerAI(world, gameState) {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    const town = gameState.towns.find(t => t.id === this.townId || t.kingdomKey === this.kingdomKey);
    const stockpile = town ? (town.buildings.find(b => (b.type === 'STOCKPILE' || b.type === 'TOWN_HALL') && b.isCompleted && !b.isRuined) || town.buildings.find(b => !b.isRuined)) : null;

    const totalCarrying = (this.carryingStone || 0) + (this.carryingGold || 0) + (this.carryingIron || 0);

    if ((totalCarrying >= 10 || (totalCarrying > 0 && !this.harvestTargetRes)) && stockpile) {
      this.releaseClaim();
      const dist = Math.hypot(stockpile.x - this.x, stockpile.y - this.y);
      if (dist <= 1.2) {
        if (town) {
          town.resources.stone = (town.resources.stone || 0) + (this.carryingStone || 0);
          town.resources.gold = (town.resources.gold || 0) + (this.carryingGold || 0);
          town.resources.iron = (town.resources.iron || 0) + (this.carryingIron || 0);
        }
        this.carryingStone = 0;
        this.carryingGold = 0;
        this.carryingIron = 0;
        this.state = 'IDLE';
        this.path = [];
      } else if (this.state !== 'MOVING' || this.path.length === 0) {
        this.setMoveTarget(stockpile.x, stockpile.y, world);
      }
      return;
    }

    const res = world.getResource(rx, ry);
    const isMineable = res && res.amount > 0 && (!res.claimedBy || res.claimedBy === this.id) &&
      (res.type === CONFIG.RESOURCES.STONE || res.type === CONFIG.RESOURCES.GOLD || res.type === CONFIG.RESOURCES.IRON ||
       res.type === CONFIG.RESOURCES.STONE_ROCK || res.type === CONFIG.RESOURCES.GOLD_ORE || res.type === CONFIG.RESOURCES.IRON_ORE ||
       res.nodeType === 'STONE_ROCK' || res.nodeType === 'GOLD_ORE' || res.nodeType === 'IRON_ORE');

    if (isMineable) {
      res.claimedBy = this.id;
      this.harvestTargetRes = res;
      this.harvestTimer++;
      this.state = 'MINING';

      if (this.harvestTimer % 5 === 0) {
        gameState.addChopFx(rx, ry);
      }

      if (this.harvestTimer >= CONFIG.TICKS_PER_SEC * 1.5) {
        this.harvestTimer = 0;
        const harvestAmt = Math.min(10, res.amount);
        res.amount -= harvestAmt;

        if (res.type === CONFIG.RESOURCES.GOLD || res.type === CONFIG.RESOURCES.GOLD_ORE || res.nodeType === 'GOLD_ORE') {
          this.carryingGold += harvestAmt;
        } else if (res.type === CONFIG.RESOURCES.IRON || res.type === CONFIG.RESOURCES.IRON_ORE || res.nodeType === 'IRON_ORE') {
          this.carryingIron += harvestAmt;
        } else {
          this.carryingStone += harvestAmt;
        }

        if (res.amount <= 0) {
          res.claimedBy = null;
          this.harvestTargetRes = null;
          world.resources[ry * world.width + rx] = null;
        }

        if (stockpile) {
          this.setMoveTarget(stockpile.x, stockpile.y, world);
        }
      }
    } else {
      this.releaseClaim();
      if (this.state === 'IDLE' && CONFIG.prng.random() < 0.15) {
        for (let dy = -8; dy <= 8; dy++) {
          for (let dx = -8; dx <= 8; dx++) {
            const nx = rx + dx;
            const ny = ry + dy;
            if (nx >= 0 && nx < CONFIG.WORLD_WIDTH && ny >= 0 && ny < CONFIG.WORLD_HEIGHT) {
              const targetRes = world.getResource(nx, ny);
              const tile = world.getTile(nx, ny);
              const isOre = targetRes && targetRes.amount > 0 && !targetRes.claimedBy &&
                (targetRes.type === CONFIG.RESOURCES.STONE || targetRes.type === CONFIG.RESOURCES.GOLD || targetRes.type === CONFIG.RESOURCES.IRON ||
                 targetRes.type === CONFIG.RESOURCES.STONE_ROCK || targetRes.type === CONFIG.RESOURCES.GOLD_ORE || targetRes.type === CONFIG.RESOURCES.IRON_ORE ||
                 targetRes.nodeType === 'STONE_ROCK' || targetRes.nodeType === 'GOLD_ORE' || targetRes.nodeType === 'IRON_ORE');
              if ((tile === CONFIG.TILES.MOUNTAIN || isOre) && isOre && world.isPassable(nx, ny, false)) {
                targetRes.claimedBy = this.id;
                this.harvestTargetRes = targetRes;
                this.setMoveTarget(nx, ny, world);
                return;
              }
            }
          }
        }
      }
      if (this.state === 'IDLE' && CONFIG.prng.random() < 0.08) {
        const nx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(this.x + (CONFIG.prng.random() - 0.5) * 10)));
        const ny = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(this.y + (CONFIG.prng.random() - 0.5) * 10)));
        if (world.isPassable(nx, ny, false)) {
          this.setMoveTarget(nx, ny, world);
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
