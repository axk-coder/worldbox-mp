class WorldMap {
  constructor(width = CONFIG.WORLD_WIDTH, height = CONFIG.WORLD_HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height);
    this.heightMap = new Float32Array(width * height);
    this.resources = new Array(width * height).fill(null);
    this.fallout = new Uint8Array(width * height);
    this.kingdomOwner = new Array(width * height).fill(null);
    this.tileNoise = new Float32Array(width * height);
    this.noise = new SimplexNoise(Math.floor(Math.random() * 999999));
  }

  generate(seed = Math.floor(Math.random() * 9999999)) {
    this.noise.seed(seed);
    this.tiles.fill(0);
    this.heightMap.fill(0);
    this.resources.fill(null);
    this.fallout.fill(0);
    this.kingdomOwner.fill(null);

    const scale = 0.025 + Math.random() * 0.02;
    const detailScale = 0.06 + Math.random() * 0.03;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        let e = (this.noise.noise2D(x * scale, y * scale) + 1) / 2;
        let detail = (this.noise.noise2D(x * detailScale, y * detailScale) + 1) / 2;
        let heightVal = e * 0.65 + detail * 0.35;

        let dx = (x - this.width / 2) / (this.width / 2);
        let dy = (y - this.height / 2) / (this.height / 2);
        let dist = Math.sqrt(dx * dx + dy * dy);
        heightVal = heightVal * (1 - Math.pow(dist, 1.8));

        this.heightMap[idx] = heightVal;
        this.tileNoise[idx] = (this.noise.noise2D(x * 0.25, y * 0.25) * 0.08);

        if (heightVal < 0.25) {
          this.tiles[idx] = CONFIG.TILES.DEEP_WATER;
        } else if (heightVal < 0.34) {
          this.tiles[idx] = CONFIG.TILES.SHALLOW_WATER;
        } else if (heightVal < 0.40) {
          this.tiles[idx] = CONFIG.TILES.SAND;
        } else if (heightVal < 0.68) {
          this.tiles[idx] = CONFIG.TILES.GRASS;
          if (Math.random() < 0.2) {
            this.resources[idx] = { type: CONFIG.RESOURCES.WOOD, amount: 150 };
            this.tiles[idx] = CONFIG.TILES.FOREST;
          }
        } else if (heightVal < 0.85) {
          this.tiles[idx] = CONFIG.TILES.MOUNTAIN;
          if (Math.random() < 0.12) {
            this.resources[idx] = { type: CONFIG.RESOURCES.STONE, amount: 200 };
          }
        } else {
          this.tiles[idx] = CONFIG.TILES.SNOW;
        }
      }
    }
  }

  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.tiles[y * this.width + x];
  }

  setTile(x, y, tileType) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = y * this.width + x;
    this.tiles[idx] = tileType;
    if (tileType === CONFIG.TILES.DEEP_WATER || tileType === CONFIG.TILES.SHALLOW_WATER) {
      this.kingdomOwner[idx] = null;
    }
  }

  applyBrush(cx, cy, radius, tool) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;
        if (Math.hypot(dx, dy) <= radius) {
          const idx = ty * this.width + tx;
          if (tool === 'RAISE_LAND') {
            this.tiles[idx] = CONFIG.TILES.GRASS;
          } else if (tool === 'LOWER_LAND') {
            this.tiles[idx] = CONFIG.TILES.SHALLOW_WATER;
            this.kingdomOwner[idx] = null;
          } else if (tool === 'PLANT_FOREST') {
            this.tiles[idx] = CONFIG.TILES.FOREST;
            this.resources[idx] = { type: CONFIG.RESOURCES.WOOD, amount: 150 };
          } else if (tool === 'BUILD_MOUNTAIN') {
            this.tiles[idx] = CONFIG.TILES.MOUNTAIN;
            this.resources[idx] = { type: CONFIG.RESOURCES.STONE, amount: 200 };
          }
        }
      }
    }
  }

  updateErosion() {
    if (Math.random() > 0.08) return;
    const rx = Math.floor(Math.random() * (this.width - 2)) + 1;
    const ry = Math.floor(Math.random() * (this.height - 2)) + 1;
    const idx = ry * this.width + rx;

    if (this.tiles[idx] === CONFIG.TILES.GRASS || this.tiles[idx] === CONFIG.TILES.FOREST) {
      const neighbors = [
        this.tiles[(ry - 1) * this.width + rx],
        this.tiles[(ry + 1) * this.width + rx],
        this.tiles[ry * this.width + (rx - 1)],
        this.tiles[ry * this.width + (rx + 1)]
      ];
      if (neighbors.some(t => t === CONFIG.TILES.SHALLOW_WATER || t === CONFIG.TILES.DEEP_WATER)) {
        this.tiles[idx] = CONFIG.TILES.SAND;
        this.resources[idx] = null;
      }
    }
  }

  getResource(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.resources[y * this.width + x];
  }

  isPassable(x, y, isNaval = false) {
    const tile = this.getTile(x, y);
    if (tile === null) return false;
    if (isNaval) {
      return tile === CONFIG.TILES.DEEP_WATER || tile === CONFIG.TILES.SHALLOW_WATER;
    }
    return tile !== CONFIG.TILES.DEEP_WATER && tile !== CONFIG.TILES.SHALLOW_WATER && tile !== CONFIG.TILES.SNOW && tile !== CONFIG.TILES.CRATER;
  }

  applyExplosion(cx, cy, radius, isNuke = false) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const idx = ty * this.width + tx;
          if (dist <= radius * 0.6) {
            this.tiles[idx] = CONFIG.TILES.CRATER;
            this.resources[idx] = null;
            this.kingdomOwner[idx] = null;
          } else {
            if (this.tiles[idx] === CONFIG.TILES.FOREST) {
              this.tiles[idx] = CONFIG.TILES.GRASS;
              this.resources[idx] = null;
            }
          }
          if (isNuke) {
            this.fallout[idx] = 255;
          }
        }
      }
    }
  }

  tickFallout() {
    for (let i = 0; i < this.fallout.length; i++) {
      if (this.fallout[i] > 0) {
        this.fallout[i] = Math.max(0, this.fallout[i] - 1);
      }
    }
  }

  findPath(startX, startY, targetX, targetY, isNaval = false) {
    if (!this.isPassable(targetX, targetY, isNaval)) return [];

    const open = [];
    const closed = new Set();
    const parentMap = new Map();

    const startKey = `${startX},${startY}`;
    open.push({ x: startX, y: startY, g: 0, h: Math.hypot(targetX - startX, targetY - startY) });

    let iterations = 0;
    const maxIterations = 350;

    while (open.length > 0 && iterations < maxIterations) {
      iterations++;
      open.sort((a, b) => (a.g + a.h) - (b.g + b.h));
      const current = open.shift();
      const currKey = `${current.x},${current.y}`;

      if (current.x === targetX && current.y === targetY) {
        const path = [];
        let curr = currKey;
        while (curr) {
          const [px, py] = curr.split(',').map(Number);
          path.unshift({ x: px, y: py });
          curr = parentMap.get(curr);
        }
        return path;
      }

      closed.add(currKey);

      const dirs = [
        { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
        { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
      ];

      for (let dir of dirs) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nKey = `${nx},${ny}`;

        if (closed.has(nKey) || !this.isPassable(nx, ny, isNaval)) continue;

        const g = current.g + (dir.x !== 0 && dir.y !== 0 ? 1.4 : 1.0);
        const h = Math.hypot(targetX - nx, targetY - ny);
        const existingNode = open.find(n => n.x === nx && n.y === ny);

        if (!existingNode) {
          parentMap.set(nKey, currKey);
          open.push({ x: nx, y: ny, g, h });
        } else if (g < existingNode.g) {
          parentMap.set(nKey, currKey);
          existingNode.g = g;
        }
      }
    }
    return [{ x: targetX, y: targetY }];
  }
}
