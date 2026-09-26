class Building {
  constructor(id, type, x, y, ownerId, kingdomKey = 'blue', tier = 0) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.kingdomKey = kingdomKey;

    if (type === 'TENT') this.tier = 0;
    else if (type === 'SMALL_HOUSE') this.tier = 1;
    else if (type === 'MID_HOUSE') this.tier = 2;
    else if (type === 'BIG_HOUSE') this.tier = 3;
    else if (type === 'MANSION') this.tier = 4;
    else if (type === 'HOUSE') this.tier = tier !== undefined ? tier : 0;
    else this.tier = tier || 0;

    this.isHouse = (type === 'HOUSE' || type === 'TENT' || type === 'SMALL_HOUSE' || type === 'MID_HOUSE' || type === 'BIG_HOUSE' || type === 'MANSION');

    if (this.isHouse) {
      const tierInfo = CONFIG.HOUSE_TIERS[this.tier] || CONFIG.HOUSE_TIERS[0];
      this.type = tierInfo.id;
      this.hp = tierInfo.hp;
      this.maxHp = tierInfo.hp;
      this.capacity = tierInfo.capacity;
      this.stats = CONFIG.BUILDINGS[this.type] || CONFIG.BUILDINGS.HOUSE;
    } else {
      this.type = type;
      this.stats = CONFIG.BUILDINGS[type];
      this.hp = this.stats ? this.stats.hp : 100;
      this.maxHp = this.hp;
      this.capacity = 0;
    }

    this.isCompleted = (type === 'TOWN_HALL' || type === 'STOCKPILE');
    this.progress = (type === 'TOWN_HALL' || type === 'STOCKPILE') ? 100 : 0;
    this.isRuined = false;
  }

  constructTick(amount = 15) {
    if (this.isCompleted && !this.isRuined) return;
    this.progress += amount;
    if (this.progress >= 100) {
      this.progress = 100;
      this.isCompleted = true;
    }
  }

  upgradeTier() {
    if (!this.isHouse || this.tier >= CONFIG.HOUSE_TIERS.length - 1) return false;
    this.tier++;
    const tierInfo = CONFIG.HOUSE_TIERS[this.tier];
    this.type = tierInfo.id;
    this.stats = CONFIG.BUILDINGS[this.type] || CONFIG.BUILDINGS.HOUSE;
    this.hp = tierInfo.hp;
    this.maxHp = tierInfo.hp;
    this.capacity = tierInfo.capacity;
    this.isCompleted = true;
    this.progress = 100;
    return true;
  }
}

class Town {
  constructor(id, name, raceKey, x, y, ownerId, kingdomKey = 'blue', isCapital = false) {
    this.id = id;
    this.name = name;
    this.raceKey = raceKey || 'HUMAN';
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.kingdomKey = kingdomKey;
    this.isCapital = isCapital;
    this.isRuined = false;
    this.hasBeenPopulated = false;
    this.buildings = [];
    this.resources = { wood: 40, stone: 20, gold: 20, iron: 0, food: 60 };
    this.territory = new Set();
    this.level = 1;
    this.leader = null;
    this.electionTimer = 0;
    this.siegeTimer = 0;
    this.siegeDuration = 0;
    this.siegeAttackerKingdom = null;
    this.cityStarterDispatched = false;

    this.addBuilding('TOWN_HALL', x, y);
    this.addBuilding('STOCKPILE', Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, x + 1)), y);
    this.expandTerritory(x, y, 6);
  }

  addBuilding(type, x, y, tier = 0) {
    const bId = `b_${Math.floor(CONFIG.prng.random() * 100000000).toString(36)}`;
    const b = new Building(bId, type, x, y, this.ownerId, this.kingdomKey, tier);
    this.buildings.push(b);
    return b;
  }

  expandTerritory(cx, cy, radius, world = null) {
    const w = world ? world.width : CONFIG.WORLD_WIDTH;
    const h = world ? world.height : CONFIG.WORLD_HEIGHT;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.hypot(dx, dy) <= radius) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
            this.territory.add(ty * w + tx);
          }
        }
      }
    }
  }

  getTotalHousingCapacity() {
    let total = 0;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.isCompleted && !b.isRuined && b.isHouse) {
        total += b.capacity;
      }
    }
    return total;
  }

  holdElection(gameState) {
    const members = gameState.units.filter(u => u.townId === this.id && u.hp > 0);
    if (members.length === 0) {
      this.leader = null;
      return;
    }
    const princeUnit = members.find(u => u.job === 'PRINCE');
    if (princeUnit) {
      this.leader = princeUnit;
      return;
    }
    members.sort((a, b) => b.level - a.level || b.kills - a.kills);
    this.leader = members[0];
  }

  tradeWithOtherTowns(gameState) {
    const partner = gameState.towns.find(t => t.id !== this.id && !t.isRuined && t.kingdomKey !== this.kingdomKey);
    if (partner && partner.resources.food < 50 && this.resources.food > 100) {
      this.resources.food -= 20;
      partner.resources.food += 20;
      this.resources.gold += 10;
    }
  }

  reclaimRuinedBuildings(gameState) {
    for (let i = 0; i < gameState.towns.length; i++) {
      const other = gameState.towns[i];
      if (other.id !== this.id && other.isRuined) {
        for (let j = other.buildings.length - 1; j >= 0; j--) {
          const b = other.buildings[j];
          const dist = Math.hypot(b.x - this.x, b.y - this.y);
          if (dist <= 12 || this.territory.has(b.y * CONFIG.WORLD_WIDTH + b.x)) {
            b.ownerId = this.ownerId;
            b.kingdomKey = this.kingdomKey;
            b.isRuined = true;
            this.buildings.push(b);
            other.buildings.splice(j, 1);
          }
        }
      }
    }
  }

  update(world, gameState) {
    if (this.isRuined) {
      this.territory.forEach(idx => {
        if (world.kingdomOwner[idx] === this.kingdomKey) {
          world.kingdomOwner[idx] = null;
        }
      });
      for (let i = this.buildings.length - 1; i >= 0; i--) {
        const b = this.buildings[i];
        b.isRuined = true;
        b.hp -= 0.5 / CONFIG.TICKS_PER_SEC;
        if (b.hp <= 0) {
          this.buildings.splice(i, 1);
        }
      }
      return;
    }

    const currentPop = gameState.getTownUnitsCount(this.id);
    const hasActiveBuildings = this.buildings.some(b => !b.isRuined);
    if (currentPop === 0 || !hasActiveBuildings) {
      this.isRuined = true;
      this.buildings.forEach(b => { b.isRuined = true; });
      this.territory.forEach(idx => {
        if (world.kingdomOwner[idx] === this.kingdomKey) {
          world.kingdomOwner[idx] = null;
        }
      });
      if (this.isCapital) {
        this.isCapital = false;
        if (gameState.chooseNewCapital) {
          gameState.chooseNewCapital(this.kingdomKey);
        }
      }
      return;
    }

    this.territory.forEach(idx => {
      if (world.tiles[idx] !== CONFIG.TILES.DEEP_WATER && world.tiles[idx] !== CONFIG.TILES.SHALLOW_WATER) {
        world.kingdomOwner[idx] = this.kingdomKey;
      }
    });

    this.reclaimRuinedBuildings(gameState);

    let invadersNear = [];
    const cityCenters = this.buildings.filter(b => (b.type === 'TOWN_HALL' || b.type === 'STOCKPILE') && b.isCompleted && !b.isRuined);
    if (cityCenters.length === 0) {
      cityCenters.push({ x: this.x, y: this.y });
    }

    if (gameState.spatialGrid) {
      const candidateUnits = [];
      const seenIds = new Set();
      for (let i = 0; i < cityCenters.length; i++) {
        const c = cityCenters[i];
        const unitsInRad = gameState.spatialGrid.getUnitsInRadius(c.x, c.y, 4.0);
        for (let j = 0; j < unitsInRad.length; j++) {
          const u = unitsInRad[j];
          if (!seenIds.has(u.id)) {
            seenIds.add(u.id);
            if (u.kingdomKey !== this.kingdomKey && u.hp > 0 && (u.job === 'ARMY_MAN' || u.type === 'INFANTRY' || u.type === 'ARCHER') && (gameState.isAtWar ? gameState.isAtWar(u.kingdomKey, this.kingdomKey) : true)) {
              candidateUnits.push(u);
            }
          }
        }
      }
      invadersNear = candidateUnits;
    } else {
      invadersNear = gameState.units.filter(u => u.kingdomKey !== this.kingdomKey && u.hp > 0 && (u.job === 'ARMY_MAN' || u.type === 'INFANTRY' || u.type === 'ARCHER') && (gameState.isAtWar ? gameState.isAtWar(u.kingdomKey, this.kingdomKey) : true) && cityCenters.some(c => Math.hypot(u.x - c.x, u.y - c.y) <= 4.0));
    }

    if (invadersNear.length > 0) {
      const currentAttackerPresent = this.siegeAttackerKingdom && invadersNear.some(u => u.kingdomKey === this.siegeAttackerKingdom);
      if (this.siegeTimer === 0 || !this.siegeAttackerKingdom || !currentAttackerPresent) {
        const attacker = invadersNear[0];
        this.siegeDuration = Math.floor(200 + CONFIG.prng.random() * 401);
        this.siegeAttackerKingdom = attacker.kingdomKey;
        this.siegeTimer = 0;
      }
      this.siegeTimer++;
      if (this.siegeTimer >= this.siegeDuration) {
        const oldKingdom = this.kingdomKey;
        const newKingdom = this.siegeAttackerKingdom;
        const conquerorUnit = invadersNear.find(u => u.kingdomKey === newKingdom) || invadersNear[0];
        const conquerorOwnerId = conquerorUnit ? conquerorUnit.ownerId : this.ownerId;
        const wasCapital = this.isCapital;

        this.isCapital = false;
        this.kingdomKey = newKingdom;
        this.ownerId = conquerorOwnerId;

        gameState.units.filter(u => u.townId === this.id && u.hp > 0).forEach(u => {
          u.kingdomKey = newKingdom;
          u.ownerId = conquerorOwnerId;
          u.attackTarget = null;
          u.state = 'IDLE';
          u.siegeTargetTownId = null;
          u.siegeTimer = 0;
          u.siegeDuration = 0;
        });

        this.buildings.forEach(b => {
          b.kingdomKey = newKingdom;
          b.ownerId = conquerorOwnerId;
        });

        this.territory.forEach(idx => {
          if (world.tiles[idx] !== CONFIG.TILES.DEEP_WATER && world.tiles[idx] !== CONFIG.TILES.SHALLOW_WATER) {
            world.kingdomOwner[idx] = newKingdom;
          }
        });

        if (wasCapital && gameState.chooseNewCapital) {
          gameState.chooseNewCapital(oldKingdom);
        }

        const conqueredKingdomTowns = gameState.towns.filter(t => t.kingdomKey === newKingdom && !t.isRuined);
        if (!conqueredKingdomTowns.some(t => t.isCapital)) {
          this.isCapital = true;
        }

        this.siegeTimer = 0;
        this.siegeDuration = 0;
        this.siegeAttackerKingdom = null;
      }
    } else {
      this.siegeTimer = 0;
      this.siegeDuration = 0;
      this.siegeAttackerKingdom = null;
    }

    this.electionTimer++;
    if (this.electionTimer >= CONFIG.TICKS_PER_SEC * 10) {
      this.electionTimer = 0;
      this.holdElection(gameState);
      this.tradeWithOtherTowns(gameState);
    }

    const activeStarter = gameState.units.some(u => u.townId === this.id && u.job === 'CITY_STARTER' && u.hp > 0);
    if (!activeStarter) {
      this.cityStarterDispatched = false;
    }
    if (currentPop >= 8 && this.resources.food >= 100 && !activeStarter) {
      const candidate = gameState.units.find(u => u.townId === this.id && u.age >= 18 && u.hp > 0 && u.job !== 'CITY_STARTER' && u.job !== 'PRINCE' && !u.isNaval);
      if (candidate) {
        candidate.job = 'CITY_STARTER';
        this.cityStarterDispatched = true;
      }
    }

    const barracks = this.buildings.filter(b => b.type === 'BARRACKS' && b.isCompleted);
    if (barracks.length > 0 && this.resources.food >= 20 && this.resources.wood >= 10 && CONFIG.prng.random() < 0.06) {
      this.resources.food -= 20;
      this.resources.wood -= 10;
      const unitType = CONFIG.prng.random() > 0.4 ? 'INFANTRY' : 'ARCHER';
      const b = barracks[Math.floor(CONFIG.prng.random() * barracks.length)];
      gameState.spawnUnit(unitType, this.raceKey, b.x, b.y, this.ownerId, this.kingdomKey, this.id);
    }

    const docks = this.buildings.filter(b => b.type === 'DOCK' && b.isCompleted && !b.isRuined);
    if (docks.length > 0 && CONFIG.prng.random() < 0.05) {
      const fishingUnitsCount = gameState.units.filter(u => u.townId === this.id && (u.type === 'FISHING_BOAT' || u.type === 'FISHERMAN') && u.hp > 0).length;
      if (fishingUnitsCount < 4 && this.resources.wood >= 25 && this.resources.food >= 10) {
        const dock = docks[Math.floor(CONFIG.prng.random() * docks.length)];
        const waterSpot = this.findWaterNear(dock.x, dock.y, world);
        if (waterSpot) {
          this.resources.wood -= 25;
          this.resources.food -= 10;
          const unitType = CONFIG.prng.random() < 0.5 ? 'FISHING_BOAT' : 'FISHERMAN';
          gameState.spawnUnit(unitType, this.raceKey, waterSpot.x, waterSpot.y, this.ownerId, this.kingdomKey, this.id, 18, 'FISHERMAN');
        }
      } else if (this.resources.wood >= 50 && CONFIG.prng.random() < 0.03) {
        const dock = docks[Math.floor(CONFIG.prng.random() * docks.length)];
        const waterSpot = this.findWaterNear(dock.x, dock.y, world);
        if (waterSpot) {
          this.resources.wood -= 50;
          gameState.spawnUnit('BOAT_CANNON', this.raceKey, waterSpot.x, waterSpot.y, this.ownerId, this.kingdomKey, this.id);
        }
      }
    }

    if (this.resources.wood >= 10 && CONFIG.prng.random() < 0.04 && this.buildings.length < 15) {
      const unbuilt = this.buildings.some(b => !b.isCompleted);
      if (!unbuilt) {
        const spot = this.findBuildSpot(world);
        if (spot) {
          let bType = (this.resources.wood < 20 || CONFIG.prng.random() < 0.5) ? 'TENT' : 'SMALL_HOUSE';
          const houseCount = this.buildings.filter(b => b.isHouse || b.type === 'HOUSE' || b.type === 'TENT' || b.type === 'SMALL_HOUSE' || b.type === 'MID_HOUSE' || b.type === 'BIG_HOUSE' || b.type === 'MANSION').length;
          const barracksCount = this.buildings.filter(b => b.type === 'BARRACKS').length;
          const dockCount = this.buildings.filter(b => b.type === 'DOCK').length;

          if (houseCount >= 2 && barracksCount === 0 && (this.resources.stone || 0) >= 30) {
            bType = 'BARRACKS';
            this.resources.stone -= 30;
            this.resources.wood -= 20;
          } else if (this.isNearWater(spot.x, spot.y, world) && dockCount === 0) {
            bType = 'DOCK';
            this.resources.wood -= 20;
          } else {
            const woodCost = CONFIG.BUILDINGS[bType] ? CONFIG.BUILDINGS[bType].cost.wood : 10;
            this.resources.wood -= woodCost;
          }
          this.addBuilding(bType, spot.x, spot.y);
          this.expandTerritory(spot.x, spot.y, 3, world);
        }
      }
    }
  }

  findWaterNear(x, y, world) {
    if (world && world.findWaterNear) {
      return world.findWaterNear(x, y);
    }
    const dirs = [
      {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},
      {x:1,y:1},{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},
      {x:2,y:0},{x:-2,y:0},{x:0,y:2},{x:0,y:-2}
    ];
    for (let i = 0; i < dirs.length; i++) {
      const nx = x + dirs[i].x;
      const ny = y + dirs[i].y;
      const t = world ? world.getTile(nx, ny) : null;
      if (t === CONFIG.TILES.DEEP_WATER || t === CONFIG.TILES.SHALLOW_WATER) {
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  isNearWater(x, y, world) {
    const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    return dirs.some(d => {
      const t = world.getTile(x + d.x, y + d.y);
      return t === CONFIG.TILES.DEEP_WATER || t === CONFIG.TILES.SHALLOW_WATER;
    });
  }

  findBuildSpot(world) {
    if (this.territory.size === 0) return null;
    const arr = Array.from(this.territory);
    const len = arr.length;
    const w = world ? world.width : CONFIG.WORLD_WIDTH;
    for (let i = 0; i < 25; i++) {
      const idx = arr[Math.floor(CONFIG.prng.random() * len)];
      if (idx === undefined) continue;
      const x = idx % w;
      const y = (idx / w) | 0;
      if (world.isPassable(x, y) && !this.buildings.some(b => b.x === x && b.y === y)) {
        return { x, y };
      }
    }
    return null;
  }
}
