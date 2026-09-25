class Building {
  constructor(id, type, x, y, ownerId) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.stats = CONFIG.BUILDINGS[type];
    this.hp = this.stats ? this.stats.hp : 100;
    this.maxHp = this.hp;
    this.isCompleted = true;
    this.progress = 100;
  }
}

class Town {
  constructor(id, name, x, y, ownerId) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.buildings = [];
    this.resources = { wood: 100, stone: 50, gold: 50, food: 100 };
    this.territory = new Set();
    this.level = 1;
    this.addBuilding('TOWN_HALL', x, y);
    this.expandTerritory(x, y, 5);
  }

  addBuilding(type, x, y) {
    const bId = `b_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const b = new Building(bId, type, x, y, this.ownerId);
    this.buildings.push(b);
    return b;
  }

  expandTerritory(cx, cy, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.hypot(dx, dy) <= radius) {
          this.territory.add(`${cx + dx},${cy + dy}`);
        }
      }
    }
  }

  update(world, gameState) {
    if (this.resources.food > 20 && Math.random() < 0.05) {
      const houses = this.buildings.filter(b => b.type === 'HOUSE').length;
      if (houses * 3 > gameState.getTownUnitsCount(this.id)) {
        this.resources.food -= 15;
        gameState.spawnUnit('WORKER', this.x + (Math.random() > 0.5 ? 1 : -1), this.y + (Math.random() > 0.5 ? 1 : -1), this.ownerId, this.id);
      }
    }

    const barracks = this.buildings.filter(b => b.type === 'BARRACKS');
    if (barracks.length > 0 && this.resources.food >= 20 && this.resources.wood >= 10 && Math.random() < 0.04) {
      this.resources.food -= 20;
      this.resources.wood -= 10;
      const unitType = Math.random() > 0.4 ? 'INFANTRY' : 'ARCHER';
      const b = barracks[Math.floor(Math.random() * barracks.length)];
      gameState.spawnUnit(unitType, b.x, b.y, this.ownerId, this.id);
    }

    const docks = this.buildings.filter(b => b.type === 'DOCK');
    if (docks.length > 0 && this.resources.wood >= 60 && Math.random() < 0.02) {
      this.resources.wood -= 60;
      const dock = docks[Math.floor(Math.random() * docks.length)];
      gameState.spawnUnit('BOAT_CANNON', dock.x, dock.y, this.ownerId, this.id);
    }

    if (this.resources.wood >= 30 && Math.random() < 0.03 && this.buildings.length < 12) {
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
        this.expandTerritory(spot.x, spot.y, 2);
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
    for (let i = 0; i < 20; i++) {
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
