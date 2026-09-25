class Building {
  constructor(id, type, x, y, ownerId, kingdomKey = 'blue') {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.kingdomKey = kingdomKey;
    this.stats = CONFIG.BUILDINGS[type];
    this.hp = this.stats ? this.stats.hp : 100;
    this.maxHp = this.hp;
    this.isCompleted = type === 'TOWN_HALL';
    this.progress = type === 'TOWN_HALL' ? 100 : 0;
  }

  constructTick(amount = 15) {
    if (this.isCompleted) return;
    this.progress += amount;
    if (this.progress >= 100) {
      this.progress = 100;
      this.isCompleted = true;
    }
  }
}

class Town {
  constructor(id, name, raceKey, x, y, ownerId, kingdomKey = 'blue') {
    this.id = id;
    this.name = name;
    this.raceKey = raceKey || 'HUMAN';
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.kingdomKey = kingdomKey;
    this.buildings = [];
    this.resources = { wood: 150, stone: 80, gold: 80, food: 150 };
    this.territory = new Set();
    this.level = 1;
    this.leader = null;
    this.electionTimer = 0;
    this.addBuilding('TOWN_HALL', x, y);
    this.expandTerritory(x, y, 6);
  }

  addBuilding(type, x, y) {
    const bId = `b_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const b = new Building(bId, type, x, y, this.ownerId, this.kingdomKey);
    this.buildings.push(b);
    return b;
  }

  expandTerritory(cx, cy, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.hypot(dx, dy) <= radius) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx >= 0 && tx < CONFIG.WORLD_WIDTH && ty >= 0 && ty < CONFIG.WORLD_HEIGHT) {
            this.territory.add(`${tx},${ty}`);
          }
        }
      }
    }
  }

  holdElection(gameState) {
    const members = gameState.units.filter(u => u.townId === this.id && u.hp > 0);
    if (members.length === 0) {
      this.leader = null;
      return;
    }
    members.sort((a, b) => b.level - a.level || b.kills - a.kills);
    this.leader = members[0];
  }

  tradeWithOtherTowns(gameState) {
    const partner = gameState.towns.find(t => t.id !== this.id && t.kingdomKey !== this.kingdomKey);
    if (partner && partner.resources.food < 50 && this.resources.food > 100) {
      this.resources.food -= 20;
      partner.resources.food += 20;
      this.resources.gold += 10;
    }
  }

  update(world, gameState) {
    this.territory.forEach(key => {
      const [tx, ty] = key.split(',').map(Number);
      const idx = ty * world.width + tx;
      if (world.tiles[idx] !== CONFIG.TILES.DEEP_WATER && world.tiles[idx] !== CONFIG.TILES.SHALLOW_WATER) {
        world.kingdomOwner[idx] = this.kingdomKey;
      }
    });

    this.electionTimer++;
    if (this.electionTimer >= CONFIG.TICKS_PER_SEC * 10) {
      this.electionTimer = 0;
      this.holdElection(gameState);
      this.tradeWithOtherTowns(gameState);
    }

    const completedHouses = this.buildings.filter(b => b.type === 'HOUSE' && b.isCompleted).length;
    if (this.resources.food > 20 && Math.random() < 0.08) {
      if (completedHouses * 4 > gameState.getTownUnitsCount(this.id)) {
        this.resources.food -= 15;
        gameState.spawnUnit('WORKER', this.raceKey, this.x + (Math.random() > 0.5 ? 1 : -1), this.y + (Math.random() > 0.5 ? 1 : -1), this.ownerId, this.kingdomKey, this.id);
      }
    }

    const barracks = this.buildings.filter(b => b.type === 'BARRACKS' && b.isCompleted);
    if (barracks.length > 0 && this.resources.food >= 20 && this.resources.wood >= 10 && Math.random() < 0.06) {
      this.resources.food -= 20;
      this.resources.wood -= 10;
      const unitType = Math.random() > 0.4 ? 'INFANTRY' : 'ARCHER';
      const b = barracks[Math.floor(Math.random() * barracks.length)];
      gameState.spawnUnit(unitType, this.raceKey, b.x, b.y, this.ownerId, this.kingdomKey, this.id);
    }

    const docks = this.buildings.filter(b => b.type === 'DOCK' && b.isCompleted);
    if (docks.length > 0 && this.resources.wood >= 50 && Math.random() < 0.03) {
      this.resources.wood -= 50;
      const dock = docks[Math.floor(Math.random() * docks.length)];
      gameState.spawnUnit('BOAT_CANNON', this.raceKey, dock.x, dock.y, this.ownerId, this.kingdomKey, this.id);
    }

    if (this.resources.wood >= 30 && Math.random() < 0.04 && this.buildings.length < 15) {
      const unbuilt = this.buildings.some(b => !b.isCompleted);
      if (!unbuilt) {
        const spot = this.findBuildSpot(world);
        if (spot) {
          let bType = 'HOUSE';
          const houseCount = this.buildings.filter(b => b.type === 'HOUSE').length;
          const barracksCount = this.buildings.filter(b => b.type === 'BARRACKS').length;
          const dockCount = this.buildings.filter(b => b.type === 'DOCK').length;

          if (houseCount >= 2 && barracksCount === 0 && this.resources.stone >= 30) {
            bType = 'BARRACKS';
            this.resources.stone -= 30;
          } else if (this.isNearWater(spot.x, spot.y, world) && dockCount === 0) {
            bType = 'DOCK';
          }
          this.resources.wood -= 20;
          this.addBuilding(bType, spot.x, spot.y);
          this.expandTerritory(spot.x, spot.y, 3);
        }
      }
    }
  }

  isNearWater(x, y, world) {
    const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    return dirs.some(d => {
      const t = world.getTile(x + d.x, y + d.y);
      return t === CONFIG.TILES.DEEP_WATER || t === CONFIG.TILES.SHALLOW_WATER;
    });
  }

  findBuildSpot(world) {
    const arr = Array.from(this.territory);
    for (let i = 0; i < 25; i++) {
      const key = arr[Math.floor(Math.random() * arr.length)];
      if (!key) continue;
      const [x, y] = key.split(',').map(Number);
      if (world.isPassable(x, y) && !this.buildings.some(b => b.x === x && b.y === y)) {
        return { x, y };
      }
    }
    return null;
  }
}
