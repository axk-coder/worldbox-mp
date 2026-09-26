class WorldMap {
  constructor(width = CONFIG.WORLD_WIDTH, height = CONFIG.WORLD_HEIGHT) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.tiles = new Uint8Array(size);
    this.heightMap = new Float32Array(size);
    this.waterVolume = new Float32Array(size);
    this.resources = new Array(size).fill(null);
    this.fallout = new Uint8Array(size);
    this.kingdomOwner = new Array(size).fill(null);
    this.tileNoise = new Float32Array(size);
    this.prng = CONFIG.prng;
    this.noise = new SimplexNoise(Math.floor(this.random() * 999999));

    this.searchId = 0;
    this.visited = new Int32Array(size);
    this.parentMap = new Int32Array(size);
    this.gScore = new Float32Array(size);
    this.fScore = new Float32Array(size);
    this.heap = new Int32Array(16384);
  }

  random() {
    return this.prng ? this.prng.next() : Math.random();
  }

  generate(seed = Math.floor(this.random() * 9999999)) {
    this.seed = seed;
    if (this.prng) this.prng.setSeed(seed);
    this.noise.seed(seed);
    this.tiles.fill(0);
    this.heightMap.fill(0);
    this.waterVolume.fill(0);
    this.resources.fill(null);
    this.fallout.fill(0);
    this.kingdomOwner.fill(null);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        const nx = x / this.width - 0.5;
        const ny = y / this.height - 0.5;
        const dist = Math.sqrt(nx * nx + ny * ny) * 2;

        let e = (this.noise.fbm(x * 0.012, y * 0.012, 4, 0.5, 2.0) + 1) / 2;
        let detail = (this.noise.fbm(x * 0.04, y * 0.04, 3, 0.5, 2.0) + 1) / 2;
        let heightVal = (e * 0.7 + detail * 0.3) * (1 - Math.pow(dist, 2.2));

        this.heightMap[idx] = heightVal;
        this.tileNoise[idx] = (this.noise.noise2D(x * 0.25, y * 0.25) * 0.06);

        if (heightVal < 0.22) {
          this.tiles[idx] = CONFIG.TILES.DEEP_WATER;
          this.waterVolume[idx] = 2.5;
          if (this.random() < 0.08) {
            this.resources[idx] = { type: CONFIG.RESOURCES.FOOD, nodeType: 'FISH', amount: 150 };
          }
        } else if (heightVal < 0.32) {
          this.tiles[idx] = CONFIG.TILES.SHALLOW_WATER;
          this.waterVolume[idx] = 1.0;
          if (this.random() < 0.05) {
            this.resources[idx] = { type: CONFIG.RESOURCES.FOOD, nodeType: 'FISH', amount: 120 };
          }
        } else if (heightVal < 0.38) {
          this.tiles[idx] = CONFIG.TILES.SAND;
        } else if (heightVal < 0.70) {
          this.tiles[idx] = CONFIG.TILES.GRASS;
          const moisture = (this.noise.noise2D(x * 0.05 + 100, y * 0.05 + 100) + 1) / 2;
          if (moisture > 0.58 && this.random() < 0.35) {
            this.resources[idx] = { type: CONFIG.RESOURCES.WOOD, nodeType: 'TREE', amount: 150 };
            this.tiles[idx] = CONFIG.TILES.FOREST;
          }
        } else if (heightVal < 0.86) {
          this.tiles[idx] = CONFIG.TILES.MOUNTAIN;
          const rVal = this.random();
          if (rVal < 0.15) {
            this.resources[idx] = { type: CONFIG.RESOURCES.STONE_ROCK, nodeType: 'STONE_ROCK', amount: 200 };
          } else if (rVal < 0.20) {
            this.resources[idx] = { type: CONFIG.RESOURCES.GOLD_ORE, nodeType: 'GOLD_ORE', amount: 150 };
          } else if (rVal < 0.25) {
            this.resources[idx] = { type: CONFIG.RESOURCES.IRON_ORE, nodeType: 'IRON_ORE', amount: 150 };
          }
        } else {
          this.tiles[idx] = CONFIG.TILES.SNOW;
        }
      }
    }
  }

  generateNoiseOnly(seed) {
    this.seed = seed;
    this.noise.seed(seed);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        this.tileNoise[idx] = (this.noise.noise2D(x * 0.25, y * 0.25) * 0.06);
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
    let displacedLiquid = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;
        if (Math.hypot(dx, dy) <= radius) {
          const idx = ty * this.width + tx;
          if (tool === 'RAISE_LAND') {
            if (this.waterVolume[idx] > 0) {
              displacedLiquid += this.waterVolume[idx];
              this.waterVolume[idx] = 0;
            }
            this.heightMap[idx] = Math.min(1.0, this.heightMap[idx] + 0.25);
            this.tiles[idx] = CONFIG.TILES.GRASS;
          } else if (tool === 'LOWER_LAND') {
            this.heightMap[idx] = Math.max(0.0, this.heightMap[idx] - 0.25);
            this.waterVolume[idx] += 1.2;
            this.tiles[idx] = CONFIG.TILES.SHALLOW_WATER;
            this.kingdomOwner[idx] = null;
          } else if (tool === 'PLANT_FOREST') {
            this.tiles[idx] = CONFIG.TILES.FOREST;
            this.resources[idx] = { type: CONFIG.RESOURCES.WOOD, nodeType: 'TREE', amount: 150 };
          } else if (tool === 'BUILD_MOUNTAIN') {
            this.heightMap[idx] = Math.min(1.0, this.heightMap[idx] + 0.4);
            this.tiles[idx] = CONFIG.TILES.MOUNTAIN;
            const rVal = this.random();
            if (rVal < 0.5) {
              this.resources[idx] = { type: CONFIG.RESOURCES.STONE_ROCK, nodeType: 'STONE_ROCK', amount: 200 };
            } else if (rVal < 0.75) {
              this.resources[idx] = { type: CONFIG.RESOURCES.GOLD_ORE, nodeType: 'GOLD_ORE', amount: 150 };
            } else {
              this.resources[idx] = { type: CONFIG.RESOURCES.IRON_ORE, nodeType: 'IRON_ORE', amount: 150 };
            }
          } else if (tool === 'ADD_SHALLOW_WATER') {
            this.waterVolume[idx] += 1.0;
            this.tiles[idx] = CONFIG.TILES.SHALLOW_WATER;
            this.kingdomOwner[idx] = null;
          } else if (tool === 'ADD_DEEP_WATER') {
            this.waterVolume[idx] += 2.5;
            this.tiles[idx] = CONFIG.TILES.DEEP_WATER;
            this.kingdomOwner[idx] = null;
          } else if (tool === 'PLANT_GRASS') {
            this.tiles[idx] = CONFIG.TILES.GRASS;
            this.waterVolume[idx] = 0;
          }
        }
      }
    }

    if (displacedLiquid > 0) {
      for (let dy = -radius - 1; dy <= radius + 1; dy++) {
        for (let dx = -radius - 1; dx <= radius + 1; dx++) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            const idx = ty * this.width + tx;
            if (this.tiles[idx] === CONFIG.TILES.DEEP_WATER || this.tiles[idx] === CONFIG.TILES.SHALLOW_WATER) {
              this.waterVolume[idx] += displacedLiquid / 8;
            }
          }
        }
      }
    }
  }

  updateErosion() {
    for (let i = 0; i < 15; i++) {
      const rx = Math.floor(this.random() * (this.width - 2)) + 1;
      const ry = Math.floor(this.random() * (this.height - 2)) + 1;
      const idx = ry * this.width + rx;
      const tile = this.tiles[idx];

      if (tile === CONFIG.TILES.GRASS || tile === CONFIG.TILES.FOREST) {
        const n1 = this.tiles[(ry - 1) * this.width + rx];
        const n2 = this.tiles[(ry + 1) * this.width + rx];
        const n3 = this.tiles[ry * this.width + (rx - 1)];
        const n4 = this.tiles[ry * this.width + (rx + 1)];
        if (n1 === CONFIG.TILES.DEEP_WATER || n1 === CONFIG.TILES.SHALLOW_WATER ||
            n2 === CONFIG.TILES.DEEP_WATER || n2 === CONFIG.TILES.SHALLOW_WATER ||
            n3 === CONFIG.TILES.DEEP_WATER || n3 === CONFIG.TILES.SHALLOW_WATER ||
            n4 === CONFIG.TILES.DEEP_WATER || n4 === CONFIG.TILES.SHALLOW_WATER) {
          this.tiles[idx] = CONFIG.TILES.SAND;
          this.heightMap[idx] = 0.34;
          this.resources[idx] = null;
        }
      } else if (tile === CONFIG.TILES.SAND) {
        const n1 = this.tiles[(ry - 1) * this.width + rx];
        const n2 = this.tiles[(ry + 1) * this.width + rx];
        const n3 = this.tiles[ry * this.width + (rx - 1)];
        const n4 = this.tiles[ry * this.width + (rx + 1)];
        if (n1 === CONFIG.TILES.DEEP_WATER || n2 === CONFIG.TILES.DEEP_WATER ||
            n3 === CONFIG.TILES.DEEP_WATER || n4 === CONFIG.TILES.DEEP_WATER) {
          this.tiles[idx] = CONFIG.TILES.SHALLOW_WATER;
          this.heightMap[idx] = 0.28;
          this.waterVolume[idx] = 1.0;
          this.resources[idx] = null;
          this.kingdomOwner[idx] = null;
        }
      }
    }
  }

  updateWaterFlow() {
    const dirsX = [0, 1, 0, -1];
    const dirsY = [-1, 0, 1, 0];
    for (let i = 0; i < 40; i++) {
      const rx = Math.floor(this.random() * (this.width - 2)) + 1;
      const ry = Math.floor(this.random() * (this.height - 2)) + 1;
      const idx = ry * this.width + rx;
      const vol = this.waterVolume[idx];

      if (vol <= 0.05 && (this.tiles[idx] === CONFIG.TILES.DEEP_WATER || this.tiles[idx] === CONFIG.TILES.SHALLOW_WATER)) {
        if (this.heightMap[idx] < 0.35) {
          this.tiles[idx] = CONFIG.TILES.SAND;
        } else {
          this.tiles[idx] = CONFIG.TILES.GRASS;
        }
        continue;
      }

      if (vol > 0.1) {
        const currHeight = this.heightMap[idx] + vol * 0.15;
        const startDir = (this.random() * 4) | 0;

        for (let dIdx = 0; dIdx < 4; dIdx++) {
          const d = (startDir + dIdx) & 3;
          const nx = rx + dirsX[d];
          const ny = ry + dirsY[d];
          const nIdx = ny * this.width + nx;
          const nHeight = this.heightMap[nIdx] + this.waterVolume[nIdx] * 0.15;

          if (currHeight > nHeight + 0.02) {
            const flow = Math.min(vol * 0.3, (currHeight - nHeight) * 0.5);
            this.waterVolume[idx] -= flow;
            this.waterVolume[nIdx] += flow;

            if (this.waterVolume[nIdx] >= 1.8) {
              this.tiles[nIdx] = CONFIG.TILES.DEEP_WATER;
              this.kingdomOwner[nIdx] = null;
            } else if (this.waterVolume[nIdx] >= 0.4) {
              this.tiles[nIdx] = CONFIG.TILES.SHALLOW_WATER;
              this.kingdomOwner[nIdx] = null;
            }
            break;
          }
        }
      }
    }
  }

  getResource(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.resources[y * this.width + x];
  }

  findWaterNear(x, y) {
    const dirs = [
      {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},
      {x:1,y:1},{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},
      {x:2,y:0},{x:-2,y:0},{x:0,y:2},{x:0,y:-2},
      {x:2,y:1},{x:2,y:-1},{x:-2,y:1},{x:-2,y:-1},
      {x:1,y:2},{x:-1,y:2},{x:1,y:-2},{x:-1,y:-2}
    ];
    for (let i = 0; i < dirs.length; i++) {
      const nx = x + dirs[i].x;
      const ny = y + dirs[i].y;
      const t = this.getTile(nx, ny);
      if (t === CONFIG.TILES.DEEP_WATER || t === CONFIG.TILES.SHALLOW_WATER) {
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  findNearestPassableTile(cx, cy, isNaval = false, maxRadius = 3) {
    if (this.isPassable(cx, cy, isNaval)) return { x: cx, y: cy };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && this.isPassable(nx, ny, isNaval)) {
              return { x: nx, y: ny };
            }
          }
        }
      }
    }
    return null;
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
    if (startX === targetX && startY === targetY) return [{ x: targetX, y: targetY }];

    this.searchId++;
    const currentSearchId = this.searchId;
    const startIdx = startY * this.width + startX;
    const targetIdx = targetY * this.width + targetX;

    let heapSize = 0;

    this.visited[startIdx] = currentSearchId;
    this.gScore[startIdx] = 0;
    const startH = Math.hypot(targetX - startX, targetY - startY);
    this.fScore[startIdx] = startH;

    this.heap[0] = startIdx;
    heapSize = 1;

    let iterations = 0;
    const maxIterations = 400;

    const dirsX = [0, 1, 0, -1, 1, 1, -1, -1];
    const dirsY = [-1, 0, 1, 0, -1, 1, 1, -1];

    while (heapSize > 0 && iterations < maxIterations) {
      iterations++;

      const currentIdx = this.heap[0];
      const last = this.heap[heapSize - 1];
      heapSize--;
      if (heapSize > 0) {
        let i = 0;
        while ((i << 1) + 1 < heapSize) {
          let left = (i << 1) + 1;
          let right = left + 1;
          let smallest = left;
          if (right < heapSize && this.fScore[this.heap[right]] < this.fScore[this.heap[left]]) {
            smallest = right;
          }
          if (this.fScore[last] <= this.fScore[this.heap[smallest]]) break;
          this.heap[i] = this.heap[smallest];
          i = smallest;
        }
        this.heap[i] = last;
      }

      if (currentIdx === targetIdx) {
        const path = [];
        let curr = targetIdx;
        while (curr !== startIdx) {
          const cx = curr % this.width;
          const cy = (curr / this.width) | 0;
          path.unshift({ x: cx, y: cy });
          curr = this.parentMap[curr];
        }
        return path;
      }

      const currX = currentIdx % this.width;
      const currY = (currentIdx / this.width) | 0;
      const currG = this.gScore[currentIdx];

      for (let d = 0; d < 8; d++) {
        const nx = currX + dirsX[d];
        const ny = currY + dirsY[d];

        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        if (!this.isPassable(nx, ny, isNaval)) continue;

        if (d >= 4) {
          if (!this.isPassable(currX + dirsX[d], currY, isNaval) || !this.isPassable(currX, currY + dirsY[d], isNaval)) {
            continue;
          }
        }

        let waterPenalty = 0;
        if (!isNaval) {
          const t1 = this.getTile(nx + 1, ny);
          const t2 = this.getTile(nx - 1, ny);
          const t3 = this.getTile(nx, ny + 1);
          const t4 = this.getTile(nx, ny - 1);
          if (t1 === CONFIG.TILES.DEEP_WATER || t1 === CONFIG.TILES.SHALLOW_WATER ||
              t2 === CONFIG.TILES.DEEP_WATER || t2 === CONFIG.TILES.SHALLOW_WATER ||
              t3 === CONFIG.TILES.DEEP_WATER || t3 === CONFIG.TILES.SHALLOW_WATER ||
              t4 === CONFIG.TILES.DEEP_WATER || t4 === CONFIG.TILES.SHALLOW_WATER) {
            waterPenalty = 3.5;
          }
        }

        const nIdx = ny * this.width + nx;
        const stepDist = (d >= 4 ? 1.4 : 1.0) + waterPenalty;
        const newG = currG + stepDist;

        if (this.visited[nIdx] !== currentSearchId || newG < this.gScore[nIdx]) {
          this.visited[nIdx] = currentSearchId;
          this.parentMap[nIdx] = currentIdx;
          this.gScore[nIdx] = newG;
          const h = Math.hypot(targetX - nx, targetY - ny);
          const f = newG + h;
          this.fScore[nIdx] = f;

          if (heapSize < 16383) {
            let i = heapSize;
            this.heap[i] = nIdx;
            while (i > 0) {
              const parent = (i - 1) >> 1;
              if (this.fScore[this.heap[parent]] <= f) break;
              this.heap[i] = this.heap[parent];
              i = parent;
            }
            this.heap[i] = nIdx;
            heapSize++;
          }
        }
      }
    }

    return [{ x: targetX, y: targetY }];
  }
}
