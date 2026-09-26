class SpatialGrid {
  constructor(worldWidth = 256, worldHeight = 256, cellSize = 16) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = [];
    }
  }

  clear() {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].length = 0;
    }
  }

  insert(unit) {
    const cx = Math.max(0, Math.min(this.cols - 1, (unit.x / this.cellSize) | 0));
    const cy = Math.max(0, Math.min(this.rows - 1, (unit.y / this.cellSize) | 0));
    this.cells[cy * this.cols + cx].push(unit);
  }

  getUnitsInRadius(x, y, radius) {
    const minCx = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCx = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minCy = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxCy = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    const result = [];
    const rSq = radius * radius;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells[cy * this.cols + cx];
        for (let i = 0; i < cell.length; i++) {
          const u = cell[i];
          const dx = u.x - x;
          const dy = u.y - y;
          if (dx * dx + dy * dy <= rSq) {
            result.push(u);
          }
        }
      }
    }
    return result;
  }

  findClosestEnemy(unit, maxDist = 12) {
    const minCx = Math.max(0, Math.floor((unit.x - maxDist) / this.cellSize));
    const maxCx = Math.min(this.cols - 1, Math.floor((unit.x + maxDist) / this.cellSize));
    const minCy = Math.max(0, Math.floor((unit.y - maxDist) / this.cellSize));
    const maxCy = Math.min(this.rows - 1, Math.floor((unit.y + maxDist) / this.cellSize));

    let closest = null;
    let minDistSq = maxDist * maxDist;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells[cy * this.cols + cx];
        for (let i = 0; i < cell.length; i++) {
          const u = cell[i];
          if (u.kingdomKey !== unit.kingdomKey && u.hp > 0) {
            const dx = u.x - unit.x;
            const dy = u.y - unit.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < minDistSq) {
              minDistSq = dSq;
              closest = u;
            }
          }
        }
      }
    }
    return closest;
  }
}

class GameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.glRenderer = new WebGL2DRenderer(this.canvas);
    this.ctx = (this.glRenderer && this.glRenderer.gl) ? null : this.canvas.getContext('2d');
    this.world = new WorldMap();
    this.towns = [];
    this.units = [];
    this.projectiles = [];
    this.fx = [];
    this.activeWars = new Set();
    this.socketManager = new MultiSocketManager();
    this.playerId = `player_${Math.floor(Math.random() * 9000 + 1000)}`;
    this.playerKingdom = 'blue';
    this.isHost = true;
    this.hostStartTime = Date.now();
    this.syncTimer = 0;

    this.spatialGrid = new SpatialGrid(CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT, 16);
    this.colorCache = new Map();

    this.camera = { x: 0, y: 0, zoom: 1.2 };
    this.activeTool = 'INSPECT';
    this.selectedUnits = [];
    this.simSpeed = 1;
    this.waterPhase = 0;

    this.cloudOffset = { x: 0, y: 0 };
    this.clouds = [];
    this.initClouds();

    this.dragStart = null;
    this.currentMousePos = { x: 0, y: 0 };
    this.isMouseDown = false;
    this.isRightDrag = false;

    this.initCanvas();
    this.initEvents();
    this.initMultiplayer();
    this.newGame();
  }

  generateKingdomName(raceKey) {
    const prefixes = ['Valoria', 'Ironfang', 'Silverwood', 'Solaria', 'Stonepeak', 'Drakon', 'Thunder', 'Shadow', 'Aethel', 'Grimm'];
    const suffixes = ['Kingdom', 'Horde', 'Dominion', 'Hold', 'Empire', 'Realm', 'Clan', 'Dynasty'];
    const p = prefixes[Math.floor(CONFIG.prng.random() * prefixes.length)];
    const s = suffixes[Math.floor(CONFIG.prng.random() * suffixes.length)];
    return `${p} ${s}`;
  }

  initClouds() {
    this.clouds = [];
    for (let i = 0; i < 28; i++) {
      this.clouds.push({
        x: CONFIG.prng.random() * CONFIG.WORLD_WIDTH,
        y: CONFIG.prng.random() * CONFIG.WORLD_HEIGHT,
        scale: 1.2 + CONFIG.prng.random() * 1.5,
        speed: 0.15 + CONFIG.prng.random() * 0.25,
        isRaining: CONFIG.prng.random() < 0.25,
        rainTimer: Math.floor(CONFIG.prng.random() * 300)
      });
    }
  }

  initCanvas() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  newGame() {
    const freshSeed = Math.floor(CONFIG.prng.random() * 9999999);
    this.world.generate(freshSeed);
    this.towns = [];
    this.units = [];
    this.projectiles = [];
    this.fx = [];
    this.warSourceKingdom = null;

    this.centerCameraOn(80, 80);
    if (this.isHost && this.socketManager) {
      this.broadcastWorldSync();
    }
  }

  centerCameraOn(tx, ty) {
    this.camera.x = (tx * CONFIG.TILE_SIZE * this.camera.zoom) - (this.canvas.width / 2);
    this.camera.y = (ty * CONFIG.TILE_SIZE * this.camera.zoom) - (this.canvas.height / 2);
  }

  chooseNewCapital(kingdomKey) {
    if (!kingdomKey) return null;
    const activeTowns = this.towns.filter(t => t.kingdomKey === kingdomKey && !t.isRuined && t.buildings.some(b => !b.isRuined));
    if (activeTowns.length === 0) return null;
    activeTowns.forEach(t => t.isCapital = false);
    activeTowns.sort((a, b) => {
      const popA = this.getTownUnitsCount(a.id);
      const popB = this.getTownUnitsCount(b.id);
      if (popB !== popA) return popB - popA;
      const bCountA = a.buildings.filter(b => !b.isRuined).length;
      const bCountB = b.buildings.filter(b => !b.isRuined).length;
      if (bCountB !== bCountA) return bCountB - bCountA;
      return a.id.localeCompare(b.id);
    });
    activeTowns[0].isCapital = true;
    return activeTowns[0];
  }

  findNearbyKingdom(x, y, radius = 16) {
    let closestKingdomKey = null;
    let closestTown = null;
    let minDist = radius + 1;

    for (let t of this.towns) {
      if (t.isRuined) continue;
      const dist = Math.hypot(t.x - x, t.y - y);
      if (dist <= radius && dist < minDist) {
        minDist = dist;
        closestTown = t;
        closestKingdomKey = t.kingdomKey;
      }
    }

    if (!closestKingdomKey) {
      const minX = Math.max(0, Math.floor(x - radius));
      const maxX = Math.min(this.world.width - 1, Math.floor(x + radius));
      const minY = Math.max(0, Math.floor(y - radius));
      const maxY = Math.min(this.world.height - 1, Math.floor(y + radius));

      for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
          const kKey = this.world.kingdomOwner[ty * this.world.width + tx];
          if (kKey) {
            const dist = Math.hypot(tx - x, ty - y);
            if (dist <= radius && dist < minDist) {
              minDist = dist;
              closestKingdomKey = kKey;
              closestTown = this.towns.find(t => t.kingdomKey === kKey && !t.isRuined) || null;
            }
          }
        }
      }
    }

    if (closestKingdomKey) {
      return { kingdomKey: closestKingdomKey, town: closestTown };
    }
    return null;
  }

  spawnKingdom(raceKey, name, x, y, kingdomKey = null) {
    if (!this.world.isPassable(x, y, false)) return null;

    if (!kingdomKey) {
      kingdomKey = `k_${raceKey.toLowerCase()}_${this.towns.length + 1}_${Math.floor(CONFIG.prng.random() * 1000)}`;
    }
    const kingdomName = name || this.generateKingdomName(raceKey);
    CONFIG.registerKingdom(kingdomKey, kingdomName, raceKey);

    const isFirstTown = !this.towns.some(t => t.kingdomKey === kingdomKey && !t.isRuined);
    const tId = `t_${Math.floor(CONFIG.prng.random() * 100000000).toString(36)}`;
    const town = new Town(tId, kingdomName, raceKey, x, y, this.playerId, kingdomKey, isFirstTown);
    this.towns.push(town);

    for (let i = 0; i < 2; i++) {
      this.spawnUnit('WORKER', raceKey, x + (i % 2), y + Math.floor(i / 2), this.playerId, kingdomKey, tId, 18);
    }
    return town;
  }

  spawnUnit(type, raceKey, x, y, ownerId, kingdomKey = null, townId = null, initialAge = 21, initialJob = null) {
    const raceConfig = CONFIG.RACES[raceKey] || CONFIG.RACES.HUMAN;
    const isNaval = CONFIG.UNITS[type] ? CONFIG.UNITS[type].isNaval : false;
    if (!this.world.isPassable(x, y, isNaval)) return null;

    if (!townId && !isNaval) {
      if (kingdomKey && this.towns.some(t => t.kingdomKey === kingdomKey && !t.isRuined)) {
        const existingTown = this.towns.find(t => t.kingdomKey === kingdomKey && !t.isRuined);
        if (existingTown) townId = existingTown.id;
      } else {
        const nearby = this.findNearbyKingdom(x, y, 16);
        if (nearby) {
          kingdomKey = nearby.kingdomKey;
          if (nearby.town) {
            townId = nearby.town.id;
          } else {
            const existingTown = this.towns.find(t => t.kingdomKey === kingdomKey && !t.isRuined);
            if (existingTown) {
              townId = existingTown.id;
            } else {
              const newTown = this.spawnKingdom(raceKey, null, Math.floor(x), Math.floor(y), kingdomKey);
              if (newTown) {
                kingdomKey = newTown.kingdomKey;
                townId = newTown.id;
              }
            }
          }
        } else {
          const newTown = this.spawnKingdom(raceKey, null, Math.floor(x), Math.floor(y), kingdomKey);
          if (newTown) {
            kingdomKey = newTown.kingdomKey;
            townId = newTown.id;
          }
        }
      }
    }

    if (!kingdomKey) {
      kingdomKey = raceConfig.kingdomKey;
    }
    CONFIG.registerKingdom(kingdomKey, null, raceKey);

    const uId = `u_${Math.floor(CONFIG.prng.random() * 100000000).toString(36)}`;
    const unit = new Unit(uId, type, raceKey, x, y, ownerId, kingdomKey, townId, initialAge, initialJob);
    this.units.push(unit);
    return unit;
  }

  isAtWar(k1, k2) {
    if (!k1 || !k2 || k1 === k2) return false;
    if (this.activeWars && this.activeWars.size > 0) {
      const pairKey = [k1, k2].sort().join(':');
      if (this.activeWars.has(pairKey)) return true;
    }
    return true;
  }

  initiateWar(sourceKingdomKey, targetKingdomKey) {
    if (!sourceKingdomKey || !targetKingdomKey || sourceKingdomKey === targetKingdomKey) return;

    if (!this.activeWars) this.activeWars = new Set();
    const pairKey = [sourceKingdomKey, targetKingdomKey].sort().join(':');
    this.activeWars.add(pairKey);

    const targetTown = this.towns.find(t => t.kingdomKey === targetKingdomKey && !t.isRuined);
    const sourceTown = this.towns.find(t => t.kingdomKey === sourceKingdomKey && !t.isRuined);
    const targetX = targetTown ? targetTown.x : CONFIG.WORLD_WIDTH / 2;
    const targetY = targetTown ? targetTown.y : CONFIG.WORLD_HEIGHT / 2;
    const sourceX = sourceTown ? sourceTown.x : CONFIG.WORLD_WIDTH / 2;
    const sourceY = sourceTown ? sourceTown.y : CONFIG.WORLD_HEIGHT / 2;

    const sourceUnits = this.units.filter(u => u.kingdomKey === sourceKingdomKey && u.hp > 0);
    const targetUnits = this.units.filter(u => u.kingdomKey === targetKingdomKey && u.hp > 0);

    const enemyInTarget = targetUnits[0] || null;
    const enemyInSource = sourceUnits[0] || null;

    sourceUnits.forEach(u => {
      if (enemyInTarget) {
        u.attackTarget = enemyInSource ? enemyInTarget : null;
      }
      u.setMoveTarget(Math.floor(targetX), Math.floor(targetY), this.world);
    });

    targetUnits.forEach(u => {
      if (enemyInSource) {
        u.attackTarget = enemyInTarget ? enemyInSource : null;
      }
      u.setMoveTarget(Math.floor(sourceX), Math.floor(sourceY), this.world);
    });

    this.addExplosionFx(targetX, targetY, 4, false);
    this.addExplosionFx(sourceX, sourceY, 4, false);

    if (this.isHost) {
      this.broadcastWorldSync();
    }
  }

  getTownUnitsCount(townId) {
    return this.units.filter(u => u.townId === townId && u.hp > 0).length;
  }

  addExplosionFx(x, y, radius, isNuke) {
    this.fx.push({
      x, y, radius, isNuke,
      life: 1.0,
      maxLife: isNuke ? 3.0 : 1.0
    });
  }

  addChopFx(x, y) {
    for (let i = 0; i < 3; i++) {
      this.fx.push({
        x: x + (CONFIG.prng.random() - 0.5) * 0.6,
        y: y + (CONFIG.prng.random() - 0.5) * 0.6,
        radius: 0.15,
        isChop: true,
        color: CONFIG.prng.random() > 0.5 ? '#8d6e63' : '#2e7d32',
        life: 0.4,
        maxLife: 0.4
      });
    }
  }

  requestWorldSync() {
    if (this.socketManager) {
      this.socketManager.send({
        type: 'REQUEST_WORLD_SYNC',
        sender: this.playerId
      });
    }
  }

  updateHudModeText() {
    const el = document.getElementById('stat-mode');
    if (!el) return;
    const rawType = this.socketManager ? (this.socketManager.currentType || 'BROADCAST') : 'BROADCAST';
    const typeLabel = rawType.split('_')[0];
    el.innerText = `${typeLabel} (${this.isHost ? 'Host' : 'Client'})`;
  }

  initMultiplayer() {
    this.socketManager.init(CONFIG.SOCKET_TYPES.BROADCAST, 'LAN_ROOM_1', this.isHost);
    this.socketManager.onMessage((packet) => {
      this.handleNetworkPacket(packet);
    });
    this.updateHudModeText();
  }

  handleNetworkPacket(packet) {
    if (!packet || packet.sender === this.playerId) return;

    if (packet.type === 'ROLE_ASSIGNMENT') {
      this.isHost = packet.isHost;
      if (this.socketManager) this.socketManager.isHost = packet.isHost;
      this.updateHudModeText();
      if (!this.isHost) {
        this.requestWorldSync();
      }
    } else if (packet.type === 'WHO_IS_HOST') {
      if (this.isHost) {
        this.socketManager.send({ type: 'I_AM_HOST', roomCode: this.socketManager.roomCode, sender: this.playerId, startTime: this.hostStartTime });
      }
    } else if (packet.type === 'I_AM_HOST') {
      if (this.isHost) {
        const remoteTime = packet.startTime || 0;
        if (remoteTime < this.hostStartTime || (remoteTime === this.hostStartTime && packet.sender < this.playerId)) {
          this.isHost = false;
          if (this.socketManager) this.socketManager.isHost = false;
          this.updateHudModeText();
          this.requestWorldSync();
        }
      }
    } else if (packet.type === 'HOST_WORLD_SYNC') {
      if (!this.isHost && packet.snapshot) {
        this.applyWorldSync(packet.snapshot);
      }
    } else if (packet.type === 'CLIENT_ACTION_REQUEST') {
      if (this.isHost) {
        this.handleClientActionRequest(packet);
      }
    } else if (packet.type === 'LOAD_WORLD_STATE') {
      this.loadGame(packet.saveData, true);
    } else if (packet.type === 'REQUEST_WORLD_SYNC' || packet.type === 'REQUEST_WORLD_STATE' || packet.type === 'PEER_JOINED') {
      if (this.isHost) {
        this.broadcastWorldSync();
      }
    }
  }

  encodeBytesToBase64(bytes) {
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  decodeBase64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  handleClientActionRequest(req) {
    if (!this.isHost || !req) return;

    if (req.actionType === 'BRUSH_TERRAIN') {
      const allowedTools = ['RAISE_LAND', 'LOWER_LAND', 'PLANT_FOREST', 'BUILD_MOUNTAIN', 'ADD_SHALLOW_WATER', 'ADD_DEEP_WATER', 'PLANT_GRASS'];
      if (!allowedTools.includes(req.tool)) return;
      const x = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, parseInt(req.x) || 0));
      const y = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, parseInt(req.y) || 0));
      const radius = Math.max(1, Math.min(10, parseInt(req.radius) || 3));
      this.world.applyBrush(x, y, radius, req.tool);
    } else if (req.actionType === 'SPAWN_CREATURE') {
      if (!CONFIG.RACES[req.raceKey]) return;
      const x = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, parseInt(req.x) || 0));
      const y = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, parseInt(req.y) || 0));
      this.spawnUnit('WORKER', req.raceKey, x, y, req.sender || 'client', null, null, 21);
    } else if (req.actionType === 'LAUNCH_WEAPON') {
      if (!CONFIG.WEAPONS[req.weaponType]) return;
      const tx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, parseFloat(req.targetX) || 0));
      const ty = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, parseFloat(req.targetY) || 0));
      this.launchWeapon(req.weaponType, tx, ty);
    } else if (req.actionType === 'COMMAND_UNITS') {
      const ids = Array.isArray(req.unitIds) ? req.unitIds.slice(0, 500) : [];
      const tx = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, parseFloat(req.targetX) || 0));
      const ty = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, parseFloat(req.targetY) || 0));
      const targetTileX = Math.floor(tx);
      const targetTileY = Math.floor(ty);
      const unitsToMove = this.units.filter(u => ids.includes(u.id));

      const nearbyUnits = this.spatialGrid ? this.spatialGrid.getUnitsInRadius(tx, ty, 1.5) : this.units;

      unitsToMove.forEach((unit, idx) => {
        const enemyUnit = nearbyUnits.find(u => u.kingdomKey !== unit.kingdomKey && Math.hypot(u.x - tx, u.y - ty) < 1.5);
        const offsetX = (idx % 4) - 1.5;
        const offsetY = Math.floor(idx / 4) - 1.5;
        const finalX = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(targetTileX + offsetX)));
        const finalY = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(targetTileY + offsetY)));

        if (enemyUnit) {
          unit.attackTarget = enemyUnit;
        } else {
          unit.attackTarget = null;
          unit.setMoveTarget(finalX, finalY, this.world);
        }
      });
    } else if (req.actionType === 'DECLARE_WAR') {
      const src = String(req.sourceKingdom || '').slice(0, 64);
      const tgt = String(req.targetKingdom || '').slice(0, 64);
      if (src && tgt && src !== tgt && CONFIG.KINGDOM_COLORS[src] && CONFIG.KINGDOM_COLORS[tgt]) {
        this.initiateWar(src, tgt);
      }
    }

    this.broadcastWorldSync();
  }

  getHostWorldSnapshot() {
    const heightBytes = new Uint8Array(this.world.heightMap.buffer);
    const waterBytes = new Uint8Array(this.world.waterVolume.buffer);

    return {
      seed: this.world.seed,
      prngSeed: CONFIG.prng.seed,
      kingdomColors: CONFIG.KINGDOM_COLORS,
      tilesB64: this.encodeBytesToBase64(this.world.tiles),
      heightMapB64: this.encodeBytesToBase64(heightBytes),
      waterVolumeB64: this.encodeBytesToBase64(waterBytes),
      falloutB64: this.encodeBytesToBase64(this.world.fallout),
      resources: this.world.resources,
      kingdomOwner: this.world.kingdomOwner,
      activeWars: Array.from(this.activeWars || []),
      towns: this.towns.map(t => ({
        id: t.id,
        name: t.name,
        raceKey: t.raceKey,
        x: t.x,
        y: t.y,
        ownerId: t.ownerId,
        kingdomKey: t.kingdomKey,
        isCapital: t.isCapital || false,
        isRuined: t.isRuined || false,
        siegeTimer: t.siegeTimer || 0,
        siegeDuration: t.siegeDuration || 0,
        siegeAttackerKingdom: t.siegeAttackerKingdom || null,
        wood: t.resources.wood,
        stone: t.resources.stone,
        gold: t.resources.gold,
        iron: t.resources.iron || 0,
        food: t.resources.food,
        territory: Array.from(t.territory || []),
        buildings: (t.buildings || []).map(b => ({
          id: b.id,
          type: b.type,
          x: b.x,
          y: b.y,
          hp: b.hp,
          maxHp: b.maxHp,
          tier: b.tier || 0,
          isCompleted: b.isCompleted,
          isRuined: b.isRuined || false,
          progress: b.progress
        }))
      })),
      units: this.units.map(u => ({
        id: u.id,
        type: u.type,
        raceKey: u.raceKey,
        x: u.x,
        y: u.y,
        hp: u.hp,
        maxHp: u.maxHp,
        ownerId: u.ownerId,
        kingdomKey: u.kingdomKey,
        townId: u.townId,
        age: u.age,
        job: u.job,
        level: u.level,
        kills: u.kills,
        state: u.state,
        carryingWood: u.carryingWood,
        carryingStone: u.carryingStone,
        carryingGold: u.carryingGold,
        carryingIron: u.carryingIron,
        carryingFood: u.carryingFood,
        hasBuildingWood: u.hasBuildingWood,
        isNaval: u.isNaval,
        siegeTimer: u.siegeTimer || 0,
        siegeDuration: u.siegeDuration || 0,
        siegeTargetTownId: u.siegeTargetTownId || null
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        targetX: p.targetX,
        targetY: p.targetY,
        sender: p.sender
      }))
    };
  }

  broadcastWorldSync() {
    if (!this.isHost || !this.socketManager) return;
    this.socketManager.send({
      type: 'HOST_WORLD_SYNC',
      sender: this.playerId,
      snapshot: this.getHostWorldSnapshot()
    });
  }

  applyWorldSync(snapshot) {
    if (this.isHost || !snapshot) return;

    if (snapshot.prngSeed !== undefined) {
      CONFIG.prng.setSeed(snapshot.prngSeed);
    }

    if (snapshot.kingdomColors) {
      Object.assign(CONFIG.KINGDOM_COLORS, snapshot.kingdomColors);
    }

    if (snapshot.tilesB64) {
      this.world.tiles = this.decodeBase64ToBytes(snapshot.tilesB64);
    } else if (snapshot.tiles) {
      this.world.tiles = new Uint8Array(snapshot.tiles);
    }

    if (snapshot.heightMapB64) {
      const b = this.decodeBase64ToBytes(snapshot.heightMapB64);
      this.world.heightMap = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    } else if (snapshot.heightMap) {
      this.world.heightMap = new Float32Array(snapshot.heightMap);
    }

    if (snapshot.waterVolumeB64) {
      const b = this.decodeBase64ToBytes(snapshot.waterVolumeB64);
      this.world.waterVolume = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    } else if (snapshot.waterVolume) {
      this.world.waterVolume = new Float32Array(snapshot.waterVolume);
    }

    if (snapshot.falloutB64) {
      this.world.fallout = this.decodeBase64ToBytes(snapshot.falloutB64);
    } else if (snapshot.fallout) {
      this.world.fallout = new Uint8Array(snapshot.fallout);
    }

    if (snapshot.seed !== undefined && this.world.seed !== snapshot.seed) {
      this.world.generateNoiseOnly(snapshot.seed);
    }

    if (snapshot.resources) {
      this.world.resources = snapshot.resources;
    }
    if (snapshot.kingdomOwner) {
      this.world.kingdomOwner = snapshot.kingdomOwner;
    }
    if (snapshot.activeWars) {
      this.activeWars = new Set(snapshot.activeWars);
    }

    if (snapshot.towns) {
      const existingTownMap = new Map(this.towns.map(t => [t.id, t]));
      this.towns = snapshot.towns.map(tData => {
        let town = existingTownMap.get(tData.id);
        if (!town) {
          town = new Town(tData.id, tData.name, tData.raceKey, tData.x, tData.y, tData.ownerId, tData.kingdomKey, tData.isCapital);
        }
        town.name = tData.name;
        town.x = tData.x;
        town.y = tData.y;
        town.isCapital = tData.isCapital || false;
        town.isRuined = tData.isRuined || false;
        town.siegeTimer = tData.siegeTimer || 0;
        town.siegeDuration = tData.siegeDuration || 0;
        town.siegeAttackerKingdom = tData.siegeAttackerKingdom || null;
        town.resources.wood = tData.wood || 0;
        town.resources.stone = tData.stone || 0;
        town.resources.gold = tData.gold || 0;
        town.resources.iron = tData.iron || 0;
        town.resources.food = tData.food || 0;
        town.territory = new Set(tData.territory || []);
        town.buildings = (tData.buildings || []).map(bData => {
          const b = new Building(bData.id, bData.type, bData.x, bData.y, tData.ownerId, tData.kingdomKey, bData.tier || 0);
          b.hp = bData.hp;
          b.maxHp = bData.maxHp;
          b.isCompleted = bData.isCompleted;
          b.isRuined = bData.isRuined || false;
          b.progress = bData.progress;
          return b;
        });
        return town;
      });
    }

    if (snapshot.units) {
      const existingUnitMap = new Map(this.units.map(u => [u.id, u]));
      this.units = snapshot.units.map(uData => {
        let unit = existingUnitMap.get(uData.id);
        if (!unit) {
          unit = new Unit(uData.id, uData.type, uData.raceKey, uData.x, uData.y, uData.ownerId, uData.kingdomKey, uData.townId, uData.age, uData.job);
          unit.x = uData.x;
          unit.y = uData.y;
        } else {
          const dist = Math.hypot(unit.x - uData.x, unit.y - uData.y);
          if (dist > 3.0) {
            unit.x = uData.x;
            unit.y = uData.y;
          } else {
            unit.x += (uData.x - unit.x) * 0.4;
            unit.y += (uData.y - unit.y) * 0.4;
          }
        }
        unit.targetSnapX = uData.x;
        unit.targetSnapY = uData.y;
        unit.hp = uData.hp;
        unit.maxHp = uData.maxHp;
        unit.age = uData.age;
        unit.job = uData.job;
        unit.state = uData.state || 'IDLE';
        unit.carryingWood = uData.carryingWood || 0;
        unit.carryingStone = uData.carryingStone || 0;
        unit.carryingGold = uData.carryingGold || 0;
        unit.carryingIron = uData.carryingIron || 0;
        unit.carryingFood = uData.carryingFood || 0;
        unit.hasBuildingWood = uData.hasBuildingWood || false;
        unit.level = uData.level || 1;
        unit.kills = uData.kills || 0;
        unit.isNaval = uData.isNaval || false;
        unit.kingdomKey = uData.kingdomKey;
        unit.townId = uData.townId;
        unit.siegeTimer = uData.siegeTimer || 0;
        unit.siegeDuration = uData.siegeDuration || 0;
        unit.siegeTargetTownId = uData.siegeTargetTownId || null;
        return unit;
      });
    }

    if (snapshot.projectiles) {
      this.projectiles = snapshot.projectiles.map(pData => {
        let p = this.projectiles.find(existing => existing.id === pData.id);
        if (!p) {
          p = new Projectile(pData.id, pData.type, pData.x, pData.y, pData.targetX, pData.targetY, pData.sender);
        }
        p.x = pData.x;
        p.y = pData.y;
        return p;
      });
    }

    this.spatialGrid.clear();
    for (let i = 0; i < this.units.length; i++) {
      if (this.units[i].hp > 0) {
        this.spatialGrid.insert(this.units[i]);
      }
    }

    this.isHost = false;
    if (this.socketManager) this.socketManager.isHost = false;
    this.updateHudModeText();

    const popEl = document.getElementById('stat-population');
    if (popEl) popEl.innerText = this.units.length;
    const kgEl = document.getElementById('stat-kingdoms');
    if (kgEl) kgEl.innerText = this.towns.filter(t => !t.isRuined).length;
  }

  saveGame() {
    const saveData = {
      version: 1,
      timestamp: Date.now(),
      kingdomColors: CONFIG.KINGDOM_COLORS,
      world: {
        width: this.world.width,
        height: this.world.height,
        seed: this.world.seed,
        grid: Array.from(this.world.tiles),
        heightMap: Array.from(this.world.heightMap),
        tileNoise: Array.from(this.world.tileNoise),
        resources: this.world.resources,
        fallout: Array.from(this.world.fallout),
        kingdomOwner: this.world.kingdomOwner
      },
      activeWars: Array.from(this.activeWars || []),
      towns: this.towns.map(t => ({
        id: t.id,
        name: t.name,
        raceKey: t.raceKey,
        x: t.x,
        y: t.y,
        ownerId: t.ownerId,
        kingdomKey: t.kingdomKey,
        isCapital: t.isCapital || false,
        isRuined: t.isRuined || false,
        siegeTimer: t.siegeTimer || 0,
        siegeDuration: t.siegeDuration || 0,
        siegeAttackerKingdom: t.siegeAttackerKingdom || null,
        wood: t.resources.wood,
        stone: t.resources.stone,
        gold: t.resources.gold,
        iron: t.resources.iron || 0,
        food: t.resources.food,
        territory: Array.from(t.territory || []),
        buildings: (t.buildings || []).map(b => ({
          id: b.id,
          type: b.type,
          x: b.x,
          y: b.y,
          hp: b.hp,
          maxHp: b.maxHp,
          tier: b.tier || 0,
          isCompleted: b.isCompleted,
          isRuined: b.isRuined || false,
          progress: b.progress
        }))
      })),
      units: this.units.map(u => ({
        id: u.id,
        type: u.type,
        raceKey: u.raceKey,
        x: u.x,
        y: u.y,
        hp: u.hp,
        maxHp: u.maxHp,
        ownerId: u.ownerId,
        kingdomKey: u.kingdomKey,
        townId: u.townId,
        age: u.age,
        job: u.job,
        level: u.level,
        kills: u.kills,
        stats: u.stats,
        carryingWood: u.carryingWood || 0,
        carryingStone: u.carryingStone || 0,
        carryingGold: u.carryingGold || 0,
        carryingIron: u.carryingIron || 0,
        carryingFood: u.carryingFood || 0,
        hasBuildingWood: u.hasBuildingWood || false,
        siegeTimer: u.siegeTimer || 0,
        siegeDuration: u.siegeDuration || 0,
        siegeTargetTownId: u.siegeTargetTownId || null
      }))
    };

    const jsonStr = JSON.stringify(saveData);
    localStorage.setItem('worldbox_save', jsonStr);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worldbox_save_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return saveData;
  }

  loadGame(saveData, isNetworkSync = false) {
    if (!saveData || !saveData.world) return false;

    if (saveData.kingdomColors) {
      Object.assign(CONFIG.KINGDOM_COLORS, saveData.kingdomColors);
    }

    this.activeWars = new Set(saveData.activeWars || []);
    this.world.width = saveData.world.width;
    this.world.height = saveData.world.height;
    this.world.seed = saveData.world.seed;
    this.world.tiles = new Uint8Array(saveData.world.grid || saveData.world.tiles);
    this.world.heightMap = new Float32Array(saveData.world.heightMap);
    this.world.tileNoise = new Float32Array(saveData.world.tileNoise);
    this.world.resources = saveData.world.resources;
    this.world.fallout = new Uint8Array(saveData.world.fallout);
    this.world.kingdomOwner = saveData.world.kingdomOwner;

    this.towns = (saveData.towns || []).map(tData => {
      const town = new Town(tData.id, tData.name, tData.raceKey, tData.x, tData.y, tData.ownerId, tData.kingdomKey, tData.isCapital);
      town.isCapital = tData.isCapital || false;
      town.isRuined = tData.isRuined || false;
      town.siegeTimer = tData.siegeTimer || 0;
      town.siegeDuration = tData.siegeDuration || 0;
      town.siegeAttackerKingdom = tData.siegeAttackerKingdom || null;
      town.resources.wood = tData.wood || 40;
      town.resources.stone = tData.stone || 20;
      town.resources.gold = tData.gold || 20;
      town.resources.iron = tData.iron || 0;
      town.resources.food = tData.food || 60;
      town.territory = new Set(tData.territory || []);
      town.buildings = (tData.buildings || []).map(bData => {
        const b = new Building(bData.id, bData.type, bData.x, bData.y, tData.ownerId, tData.kingdomKey, bData.tier || 0);
        b.hp = bData.hp;
        b.maxHp = bData.maxHp;
        b.isCompleted = bData.isCompleted;
        b.isRuined = bData.isRuined || false;
        b.progress = bData.progress;
        return b;
      });
      return town;
    });

    this.units = (saveData.units || []).map(uData => {
      const unit = new Unit(uData.id, uData.type, uData.raceKey, uData.x, uData.y, uData.ownerId, uData.kingdomKey, uData.townId, uData.age, uData.job);
      unit.hp = uData.hp;
      unit.maxHp = uData.maxHp;
      unit.level = uData.level;
      unit.kills = uData.kills;
      unit.carryingWood = uData.carryingWood || 0;
      unit.carryingStone = uData.carryingStone || 0;
      unit.carryingGold = uData.carryingGold || 0;
      unit.carryingIron = uData.carryingIron || 0;
      unit.carryingFood = uData.carryingFood || 0;
      unit.hasBuildingWood = uData.hasBuildingWood || false;
      unit.siegeTimer = uData.siegeTimer || 0;
      unit.siegeDuration = uData.siegeDuration || 0;
      unit.siegeTargetTownId = uData.siegeTargetTownId || null;
      if (uData.stats) unit.stats = uData.stats;
      return unit;
    });

    this.projectiles = [];
    this.fx = [];

    if (!isNetworkSync && this.socketManager) {
      this.socketManager.send({
        type: 'LOAD_WORLD_STATE',
        sender: this.playerId,
        saveData: saveData
      });
    }

    return true;
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem('worldbox_save');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return this.loadGame(parsed, false);
    } catch (e) {
      return false;
    }
  }

  screenToWorld(sx, sy) {
    const wx = (sx + this.camera.x) / (CONFIG.TILE_SIZE * this.camera.zoom);
    const wy = (sy + this.camera.y) / (CONFIG.TILE_SIZE * this.camera.zoom);
    return { x: wx, y: wy };
  }

  initEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isMouseDown = true;
      this.currentMousePos = { x: e.clientX, y: e.clientY };

      if (e.button === 2) {
        this.isRightDrag = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        return;
      }

      if (e.button === 0) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);
        const tx = Math.floor(worldPos.x);
        const ty = Math.floor(worldPos.y);

        if (this.activeTool === 'INSPECT') {
          const clickedUnit = this.spatialGrid ? this.spatialGrid.getUnitsInRadius(worldPos.x, worldPos.y, 1.2)[0] : this.units.find(u => Math.hypot(u.x - worldPos.x, u.y - worldPos.y) < 1.2);
          if (clickedUnit) {
            this.showCreatureInspector(clickedUnit);
          }
        } else if (this.activeTool === 'SELECT') {
          this.dragStart = { x: e.clientX, y: e.clientY };
        } else if (['RAISE_LAND', 'LOWER_LAND', 'PLANT_FOREST', 'BUILD_MOUNTAIN', 'ADD_SHALLOW_WATER', 'ADD_DEEP_WATER', 'PLANT_GRASS'].includes(this.activeTool)) {
          if (this.isHost) {
            this.world.applyBrush(tx, ty, 3, this.activeTool);
            this.broadcastWorldSync();
          } else {
            this.socketManager.send({ type: 'CLIENT_ACTION_REQUEST', actionType: 'BRUSH_TERRAIN', tool: this.activeTool, x: tx, y: ty, radius: 3, sender: this.playerId });
          }
        } else if (['BOMB', 'MISSILE', 'NUKE', 'ACID'].includes(this.activeTool)) {
          if (this.isHost) {
            this.launchWeapon(this.activeTool, worldPos.x, worldPos.y);
            this.broadcastWorldSync();
          } else {
            this.socketManager.send({ type: 'CLIENT_ACTION_REQUEST', actionType: 'LAUNCH_WEAPON', weaponType: this.activeTool, targetX: worldPos.x, targetY: worldPos.y, sender: this.playerId });
          }
        } else if (['SPAWN_HUMAN', 'SPAWN_ORC', 'SPAWN_ELF', 'SPAWN_DWARF'].includes(this.activeTool)) {
          const raceKey = this.activeTool.replace('SPAWN_', '');
          if (this.isHost) {
            this.spawnUnit('WORKER', raceKey, tx, ty, this.playerId, null, null, 21);
            this.broadcastWorldSync();
          } else {
            this.socketManager.send({ type: 'CLIENT_ACTION_REQUEST', actionType: 'SPAWN_CREATURE', raceKey, x: tx, y: ty, sender: this.playerId });
          }
        } else if (this.activeTool === 'WAR_STARTER') {
          let clickedKingdomKey = null;
          const clickedUnit = this.spatialGrid ? this.spatialGrid.getUnitsInRadius(worldPos.x, worldPos.y, 1.5)[0] : this.units.find(u => Math.hypot(u.x - worldPos.x, u.y - worldPos.y) < 1.5);
          if (clickedUnit) {
            clickedKingdomKey = clickedUnit.kingdomKey;
          } else {
            const clickedTown = this.towns.find(t => Math.hypot(t.x - worldPos.x, t.y - worldPos.y) < 6);
            if (clickedTown) {
              clickedKingdomKey = clickedTown.kingdomKey;
            } else {
              clickedKingdomKey = this.world.kingdomOwner[ty * this.world.width + tx];
            }
          }

          if (!this.warSourceKingdom) {
            if (clickedKingdomKey) {
              this.warSourceKingdom = clickedKingdomKey;
              const kInfo = CONFIG.KINGDOM_COLORS[clickedKingdomKey];
              const toolLabel = document.getElementById('label-tool');
              if (toolLabel) toolLabel.innerText = `War Starter: Pick Target (Source: ${kInfo ? kInfo.name : clickedKingdomKey})`;
            } else if (this.towns.length >= 2) {
              const src = this.towns[0].kingdomKey;
              const tgt = this.towns[1].kingdomKey;
              if (this.isHost) {
                this.initiateWar(src, tgt);
              } else {
                this.socketManager.send({ type: 'CLIENT_ACTION_REQUEST', actionType: 'DECLARE_WAR', sourceKingdom: src, targetKingdom: tgt, sender: this.playerId });
              }
            }
          } else {
            const src = this.warSourceKingdom;
            const tgt = clickedKingdomKey || (this.towns.find(t => t.kingdomKey !== src) ? this.towns.find(t => t.kingdomKey !== src).kingdomKey : null);
            this.warSourceKingdom = null;
            const toolLabel = document.getElementById('label-tool');
            if (toolLabel) toolLabel.innerText = 'War Starter';

            if (src && tgt && src !== tgt) {
              if (this.isHost) {
                this.initiateWar(src, tgt);
              } else {
                this.socketManager.send({ type: 'CLIENT_ACTION_REQUEST', actionType: 'DECLARE_WAR', sourceKingdom: src, targetKingdom: tgt, sender: this.playerId });
              }
            }
          }
        }
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isRightDrag) {
        this.camera.x -= (e.clientX - this.dragStart.x);
        this.camera.y -= (e.clientY - this.dragStart.y);
        this.dragStart = { x: e.clientX, y: e.clientY };
      }
      this.currentMousePos = { x: e.clientX, y: e.clientY };

      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      const hovered = this.spatialGrid ? this.spatialGrid.getUnitsInRadius(worldPos.x, worldPos.y, 1.2)[0] : this.units.find(u => Math.hypot(u.x - worldPos.x, u.y - worldPos.y) < 1.2);
      this.updateHoverTooltip(hovered, e.clientX, e.clientY);

      if (this.isMouseDown && ['RAISE_LAND', 'LOWER_LAND', 'PLANT_FOREST', 'BUILD_MOUNTAIN', 'ADD_SHALLOW_WATER', 'ADD_DEEP_WATER', 'PLANT_GRASS'].includes(this.activeTool)) {
        const tx = Math.floor(worldPos.x);
        const ty = Math.floor(worldPos.y);
        if (this.isHost) {
          this.world.applyBrush(tx, ty, 2, this.activeTool);
        } else {
          this.socketManager.send({ type: 'CLIENT_ACTION_REQUEST', actionType: 'BRUSH_TERRAIN', tool: this.activeTool, x: tx, y: ty, radius: 2, sender: this.playerId });
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        if (!this.isRightDrag || Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) < 5) {
          const worldPos = this.screenToWorld(e.clientX, e.clientY);
          this.commandSelectedUnits(worldPos.x, worldPos.y);
        }
        this.isRightDrag = false;
      }

      if (e.button === 0 && this.activeTool === 'SELECT' && this.dragStart) {
        this.finishBoxSelect(this.dragStart, { x: e.clientX, y: e.clientY });
      }

      this.isMouseDown = false;
      this.dragStart = null;
    });

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.min(4.0, Math.max(0.4, this.camera.zoom * zoomFactor));

      const mouseWorldBefore = this.screenToWorld(e.clientX, e.clientY);
      this.camera.zoom = newZoom;
      const mouseWorldAfter = this.screenToWorld(e.clientX, e.clientY);

      this.camera.x += (mouseWorldBefore.x - mouseWorldAfter.x) * CONFIG.TILE_SIZE * this.camera.zoom;
      this.camera.y += (mouseWorldBefore.y - mouseWorldAfter.y) * CONFIG.TILE_SIZE * this.camera.zoom;
    });
  }

  showCreatureInspector(unit) {
    const modal = document.getElementById('modal-inspector');
    if (!modal) return;

    document.getElementById('inspect-name').innerText = unit.name;
    document.getElementById('inspect-race').innerText = CONFIG.RACES[unit.raceKey] ? CONFIG.RACES[unit.raceKey].name : unit.raceKey;
    
    const town = this.towns.find(t => t.id === unit.townId);
    let kingdomLabel = CONFIG.KINGDOM_COLORS[unit.kingdomKey] ? CONFIG.KINGDOM_COLORS[unit.kingdomKey].name : unit.kingdomKey;
    if (town && town.isCapital) {
      kingdomLabel += ' (Capital)';
    }
    document.getElementById('inspect-kingdom').innerText = kingdomLabel;
    document.getElementById('inspect-age').innerText = `${unit.age} years old`;
    const jobConfig = CONFIG.JOBS ? CONFIG.JOBS[unit.job] : null;
    document.getElementById('inspect-job').innerText = jobConfig ? jobConfig.name : (unit.job || 'Worker');
    document.getElementById('inspect-hp').innerText = `${Math.round(unit.hp)} / ${unit.maxHp}`;
    document.getElementById('inspect-atk').innerText = unit.stats.atk;
    document.getElementById('inspect-kills').innerText = unit.kills;
    document.getElementById('inspect-level').innerText = unit.level;
    document.getElementById('inspect-state').innerText = unit.state;

    modal.classList.remove('hidden');
  }

  updateHoverTooltip(unit, clientX, clientY) {
    const tooltip = document.getElementById('unit-hover-tooltip');
    if (!tooltip) return;

    if (!unit || unit.hp <= 0) {
      tooltip.classList.add('hidden');
      return;
    }

    const raceName = CONFIG.RACES[unit.raceKey] ? CONFIG.RACES[unit.raceKey].name : unit.raceKey;
    let kingdomName = CONFIG.KINGDOM_COLORS[unit.kingdomKey] ? CONFIG.KINGDOM_COLORS[unit.kingdomKey].name : unit.kingdomKey;
    const town = this.towns.find(t => t.id === unit.townId);
    if (town && town.isCapital) {
      kingdomName += ' [Capital]';
    }
    const jobName = CONFIG.JOBS && CONFIG.JOBS[unit.job] ? CONFIG.JOBS[unit.job].name : (unit.job || 'Worker');

    document.getElementById('tooltip-name').innerText = unit.name;
    document.getElementById('tooltip-info').innerText = `${raceName} • ${kingdomName}`;
    document.getElementById('tooltip-job').innerText = `Age ${unit.age} • ${jobName}`;
    document.getElementById('tooltip-hp').innerText = `HP: ${Math.round(unit.hp)}/${unit.maxHp} | Lv.${unit.level} (Kills: ${unit.kills})`;
    document.getElementById('tooltip-state').innerText = `Task: ${unit.state}`;

    tooltip.style.left = `${clientX}px`;
    tooltip.style.top = `${clientY}px`;
    tooltip.classList.remove('hidden');
  }

  finishBoxSelect(start, end) {
    const p1 = this.screenToWorld(Math.min(start.x, end.x), Math.min(start.y, end.y));
    const p2 = this.screenToWorld(Math.max(start.x, end.x), Math.max(start.y, end.y));

    if (Math.abs(start.x - end.x) < 6 && Math.abs(start.y - end.y) < 6) {
      const clickPos = this.screenToWorld(start.x, start.y);
      const candidates = this.spatialGrid ? this.spatialGrid.getUnitsInRadius(clickPos.x, clickPos.y, 1.2) : this.units;
      this.selectedUnits = candidates.filter(u => u.kingdomKey === this.playerKingdom && Math.hypot(u.x - clickPos.x, u.y - clickPos.y) < 1.2);
    } else {
      this.selectedUnits = this.units.filter(u =>
        u.kingdomKey === this.playerKingdom &&
        u.x >= p1.x && u.x <= p2.x &&
        u.y >= p1.y && u.y <= p2.y
      );
    }

    this.units.forEach(u => u.selected = this.selectedUnits.includes(u));
  }

  commandSelectedUnits(tx, ty) {
    if (!this.isHost) {
      this.socketManager.send({
        type: 'CLIENT_ACTION_REQUEST',
        actionType: 'COMMAND_UNITS',
        sender: this.playerId,
        unitIds: this.selectedUnits.map(u => u.id),
        targetX: tx,
        targetY: ty
      });
      return;
    }

    const targetTileX = Math.floor(tx);
    const targetTileY = Math.floor(ty);
    const nearbyUnits = this.spatialGrid ? this.spatialGrid.getUnitsInRadius(tx, ty, 1.5) : this.units;
    const enemyUnit = nearbyUnits.find(u => u.kingdomKey !== this.playerKingdom && Math.hypot(u.x - tx, u.y - ty) < 1.5);

    this.selectedUnits.forEach((unit, idx) => {
      const offsetX = (idx % 4) - 1.5;
      const offsetY = Math.floor(idx / 4) - 1.5;
      const finalX = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - 1, Math.round(targetTileX + offsetX)));
      const finalY = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - 1, Math.round(targetTileY + offsetY)));

      if (enemyUnit) {
        unit.attackTarget = enemyUnit;
      } else {
        unit.attackTarget = null;
        unit.setMoveTarget(finalX, finalY, this.world);
      }
    });

    this.broadcastWorldSync();
  }

  launchWeapon(weaponType, tx, ty) {
    const startX = tx;
    const startY = Math.max(0, ty - 18);
    const pId = `p_${Date.now()}`;
    const proj = new Projectile(pId, weaponType, startX, startY, tx, ty, this.playerId);
    this.projectiles.push(proj);

    if (this.isHost) {
      this.broadcastWorldSync();
    }
  }

  updateClouds() {
    this.clouds.forEach(c => {
      c.x += c.speed * 0.08;
      c.y += c.speed * 0.04;

      if (c.x > CONFIG.WORLD_WIDTH + 15) {
        c.x = -25;
        c.y = CONFIG.prng.random() * (CONFIG.WORLD_HEIGHT + 20) - 10;
      }
      if (c.y > CONFIG.WORLD_HEIGHT + 15) {
        c.y = -25;
        c.x = CONFIG.prng.random() * (CONFIG.WORLD_WIDTH + 20) - 10;
      }

      c.rainTimer++;
      if (c.rainTimer > 250) {
        c.rainTimer = 0;
        c.isRaining = !c.isRaining;
      }

      if (c.isRaining && CONFIG.prng.random() < 0.2) {
        const rx = Math.floor(c.x + CONFIG.prng.random() * (c.scale || 2));
        const ry = Math.floor(c.y + CONFIG.prng.random() * ((c.scale || 2) * 0.5));
        if (rx >= 0 && rx < CONFIG.WORLD_WIDTH && ry >= 0 && ry < CONFIG.WORLD_HEIGHT) {
          const tile = this.world.getTile(rx, ry);
          if (tile === CONFIG.TILES.GRASS && CONFIG.prng.random() < 0.15) {
            this.world.setTile(rx, ry, CONFIG.TILES.FOREST);
            this.world.resources[ry * this.world.width + rx] = { type: CONFIG.RESOURCES.WOOD, nodeType: 'TREE', amount: 150 };
          } else if (tile === CONFIG.TILES.CRATER) {
            this.world.setTile(rx, ry, CONFIG.TILES.GRASS);
          }
        }
      }
    });
  }

  update() {
    if (this.simSpeed === 0) return;

    if (this.isHost) {
      for (let step = 0; step < this.simSpeed; step++) {
        this.waterPhase += 0.05;
        this.world.tickFallout();
        this.world.updateErosion();
        this.world.updateWaterFlow();

        this.spatialGrid.clear();
        for (let i = 0; i < this.units.length; i++) {
          if (this.units[i].hp > 0) {
            this.spatialGrid.insert(this.units[i]);
          }
        }

        this.towns.forEach(t => t.update(this.world, this));
        this.units.forEach(u => u.update(this.world, this));
        this.units = this.units.filter(u => u.hp > 0);
        this.projectiles.forEach(p => p.update(this.world, this));
        this.projectiles = this.projectiles.filter(p => !p.completed);

        const activeKingdomKeys = new Set(this.towns.filter(t => !t.isRuined && t.buildings.length > 0).map(t => t.kingdomKey));
        activeKingdomKeys.forEach(kKey => {
          const kTowns = this.towns.filter(t => t.kingdomKey === kKey && !t.isRuined && t.buildings.length > 0);
          if (kTowns.length > 0 && !kTowns.some(t => t.isCapital)) {
            this.chooseNewCapital(kKey);
          }
        });

        this.fx.forEach(f => f.life -= 1 / (CONFIG.TICKS_PER_SEC * f.maxLife));
        this.fx = this.fx.filter(f => f.life > 0);

        this.updateClouds();
      }

      this.syncTimer++;
      if (this.syncTimer >= 10) {
        this.syncTimer = 0;
        this.broadcastWorldSync();
      }
    } else {
      for (let step = 0; step < this.simSpeed; step++) {
        this.waterPhase += 0.05;
        this.world.tickFallout();
        this.world.updateErosion();
        this.world.updateWaterFlow();

        this.spatialGrid.clear();
        for (let i = 0; i < this.units.length; i++) {
          if (this.units[i].hp > 0) {
            this.spatialGrid.insert(this.units[i]);
          }
        }

        this.towns.forEach(t => t.update(this.world, this));
        this.units.forEach(u => u.update(this.world, this));
        this.units = this.units.filter(u => u.hp > 0);
        this.projectiles.forEach(p => p.update(this.world, this));
        this.projectiles = this.projectiles.filter(p => !p.completed);

        this.fx.forEach(f => f.life -= 1 / (CONFIG.TICKS_PER_SEC * f.maxLife));
        this.fx = this.fx.filter(f => f.life > 0);

        this.updateClouds();
      }
    }
  }

  parseColor(hex, alpha = 1.0) {
    if (!hex) return [0, 0, 0, alpha];
    const key = `${hex}_${alpha}`;
    if (this.colorCache.has(key)) return this.colorCache.get(key);

    let res = [0, 0, 0, alpha];
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
      const match = hex.match(/[\d.]+/g);
      if (match && match.length >= 3) {
        res = [
          parseFloat(match[0]) / 255,
          parseFloat(match[1]) / 255,
          parseFloat(match[2]) / 255,
          match.length >= 4 ? parseFloat(match[3]) : alpha
        ];
      }
    } else if (hex.startsWith('#')) {
      let r = 0, g = 0, b = 0;
      if (hex.length === 7) {
        r = parseInt(hex.substr(1, 2), 16) / 255;
        g = parseInt(hex.substr(3, 2), 16) / 255;
        b = parseInt(hex.substr(5, 2), 16) / 255;
      } else if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16) / 255;
        g = parseInt(hex[2] + hex[2], 16) / 255;
        b = parseInt(hex[3] + hex[3], 16) / 255;
      }
      res = [r, g, b, alpha];
    }
    this.colorCache.set(key, res);
    return res;
  }

  getShadedColor(baseHex, heightFactor) {
    const c = this.parseColor(baseHex);
    return [
      Math.min(1.0, Math.max(0.0, c[0] * heightFactor)),
      Math.min(1.0, Math.max(0.0, c[1] * heightFactor)),
      Math.min(1.0, Math.max(0.0, c[2] * heightFactor)),
      c[3]
    ];
  }

  render() {
    if (this.glRenderer && this.glRenderer.gl) {
      const glR = this.glRenderer;
      glR.begin(this.canvas.width, this.canvas.height, this.camera.x, this.camera.y, this.camera.zoom);

      const tileSize = CONFIG.TILE_SIZE;
      const screenTileW = tileSize * this.camera.zoom;
      const startTileX = Math.max(0, Math.floor(this.camera.x / screenTileW));
      const startTileY = Math.max(0, Math.floor(this.camera.y / screenTileW));
      const endTileX = Math.min(this.world.width, Math.ceil((this.camera.x + this.canvas.width) / screenTileW));
      const endTileY = Math.min(this.world.height, Math.ceil((this.camera.y + this.canvas.height) / screenTileW));

      for (let y = startTileY; y < endTileY; y++) {
        for (let x = startTileX; x < endTileX; x++) {
          const idx = y * this.world.width + x;
          const tile = this.world.getTile(x, y);
          const wx = x * tileSize;
          const wy = y * tileSize;

          const baseColor = CONFIG.TILE_COLORS[tile] || '#000000';
          const heightFactor = Math.max(0.7, Math.min(1.25, 0.75 + this.world.heightMap[idx] * 0.5 + this.world.tileNoise[idx]));
          const col = this.getShadedColor(baseColor, heightFactor);

          glR.pushQuad(wx, wy, tileSize, tileSize, col[0], col[1], col[2], col[3]);

          if (tile === CONFIG.TILES.DEEP_WATER || tile === CONFIG.TILES.SHALLOW_WATER) {
            const hash = Math.sin(x * 12.9898 + y * 78.233 + Math.floor(this.waterPhase * 0.1) * 43.758);
            const randVal = hash - Math.floor(hash);
            if (randVal > 0.982) {
              const sparkX = wx + ((randVal * 100) % 1) * (tileSize - 2);
              const sparkY = wy + ((randVal * 1000) % 1) * (tileSize - 2);
              const sparkSize = Math.max(1, tileSize * 0.15);
              glR.pushQuad(sparkX, sparkY, sparkSize, sparkSize, 1.0, 1.0, 1.0, 0.15);
            }
          }

          const kingdomKey = this.world.kingdomOwner[idx];
          if (kingdomKey && CONFIG.KINGDOM_COLORS[kingdomKey]) {
            const kCol = this.parseColor(CONFIG.KINGDOM_COLORS[kingdomKey].border, 0.35);
            glR.pushQuad(wx, wy, tileSize, tileSize, kCol[0], kCol[1], kCol[2], kCol[3]);
          }

          const falloutVal = this.world.fallout[idx];
          if (falloutVal > 0) {
            glR.pushQuad(wx, wy, tileSize, tileSize, 0.55, 0.9, 0.3, falloutVal / 350);
          }

          const resNode = this.world.resources[idx];
          if (resNode && resNode.amount > 0) {
            if (resNode.nodeType === 'TREE' || resNode.type === 'wood' || tile === CONFIG.TILES.FOREST) {
              glR.pushQuad(wx + tileSize * 0.2, wy + tileSize * 0.8, tileSize * 0.6, tileSize * 0.2, 0.0, 0.0, 0.0, 0.25);
              glR.pushQuad(wx + tileSize * 0.4, wy + tileSize * 0.5, tileSize * 0.2, tileSize * 0.4, 0.36, 0.25, 0.22, 1.0);
              glR.pushQuad(wx + tileSize * 0.15, wy + tileSize * 0.1, tileSize * 0.7, tileSize * 0.5, 0.18, 0.49, 0.2, 1.0);
              glR.pushQuad(wx + tileSize * 0.25, wy + tileSize * 0.2, tileSize * 0.5, tileSize * 0.3, 0.11, 0.37, 0.13, 1.0);
            } else if (resNode.nodeType === 'STONE_ROCK') {
              glR.pushQuad(wx + tileSize * 0.25, wy + tileSize * 0.3, tileSize * 0.5, tileSize * 0.5, 0.45, 0.47, 0.5, 1.0);
              glR.pushQuad(wx + tileSize * 0.3, wy + tileSize * 0.2, tileSize * 0.4, tileSize * 0.2, 0.6, 0.62, 0.65, 1.0);
            } else if (resNode.nodeType === 'GOLD_ORE') {
              glR.pushQuad(wx + tileSize * 0.25, wy + tileSize * 0.3, tileSize * 0.5, tileSize * 0.5, 0.45, 0.47, 0.5, 1.0);
              glR.pushQuad(wx + tileSize * 0.35, wy + tileSize * 0.35, tileSize * 0.2, tileSize * 0.2, 0.9, 0.75, 0.1, 1.0);
            } else if (resNode.nodeType === 'IRON_ORE') {
              glR.pushQuad(wx + tileSize * 0.25, wy + tileSize * 0.3, tileSize * 0.5, tileSize * 0.5, 0.35, 0.37, 0.4, 1.0);
              glR.pushQuad(wx + tileSize * 0.35, wy + tileSize * 0.35, tileSize * 0.2, tileSize * 0.2, 0.7, 0.3, 0.2, 1.0);
            } else if (resNode.nodeType === 'FISH') {
              glR.pushQuad(wx + tileSize * 0.3, wy + tileSize * 0.4, tileSize * 0.4, tileSize * 0.2, 0.3, 0.7, 0.9, 0.8);
              glR.pushQuad(wx + tileSize * 0.55, wy + tileSize * 0.35, tileSize * 0.2, tileSize * 0.3, 0.2, 0.5, 0.8, 0.8);
            }
          }
        }
      }

      this.towns.forEach(town => {
        const kColorHex = CONFIG.KINGDOM_COLORS[town.kingdomKey] ? CONFIG.KINGDOM_COLORS[town.kingdomKey].primary : '#ffffff';
        const kCol = this.parseColor(kColorHex);

        town.buildings.forEach(b => {
          const wx = b.x * tileSize;
          const wy = b.y * tileSize;

          if (town.isRuined) {
            glR.pushQuad(wx + 2, wy + 4, tileSize - 4, tileSize - 6, 0.2, 0.2, 0.2, 0.6);
            glR.pushQuad(wx + 4, wy + 8, tileSize - 8, tileSize - 10, 0.1, 0.1, 0.1, 0.8);
            return;
          }

          if (!b.isCompleted) {
            glR.pushQuad(wx + 2, wy + 4, tileSize - 4, tileSize - 6, 0.55, 0.43, 0.39, 1.0);
            glR.pushQuad(wx, wy - 5, tileSize, 4, 0.07, 0.07, 0.07, 1.0);
            glR.pushQuad(wx, wy - 5, tileSize * (b.progress / 100), 4, 0.23, 0.51, 0.96, 1.0);
          } else if (b.type === 'STOCKPILE') {
            glR.pushQuad(wx + 3, wy + tileSize * 0.7, tileSize - 4, tileSize * 0.25, 0.0, 0.0, 0.0, 0.3);
            glR.pushQuad(wx + 2, wy + 8, tileSize - 4, tileSize - 8, 0.45, 0.32, 0.22, 1.0);
            glR.pushQuad(wx + 3, wy + 4, tileSize - 6, 4, 0.55, 0.43, 0.39, 1.0);
            glR.pushQuad(wx + 4, wy + 1, tileSize - 8, 3, 0.65, 0.52, 0.45, 1.0);
          } else if (b.isHouse || b.type === 'HOUSE' || b.type === 'TENT' || b.type === 'SMALL_HOUSE' || b.type === 'MID_HOUSE' || b.type === 'BIG_HOUSE' || b.type === 'MANSION') {
            glR.pushQuad(wx + 3, wy + tileSize * 0.7, tileSize - 4, tileSize * 0.25, 0.0, 0.0, 0.0, 0.3);
            const tier = b.tier || 0;
            if (tier === 0) {
              glR.pushQuad(wx + 3, wy + 6, tileSize - 6, tileSize - 8, 0.82, 0.75, 0.6, 1.0);
              glR.pushQuad(wx + 4, wy + 2, tileSize - 8, 5, 0.65, 0.55, 0.4, 1.0);
            } else if (tier === 1) {
              glR.pushQuad(wx + 2, wy + 4, tileSize - 4, tileSize - 6, 0.45, 0.32, 0.22, 1.0);
              glR.pushQuad(wx + 1, wy, tileSize - 2, tileSize * 0.4, kCol[0], kCol[1], kCol[2], 1.0);
            } else if (tier === 2) {
              glR.pushQuad(wx + 2, wy + 8, tileSize - 4, tileSize - 10, 0.5, 0.52, 0.55, 1.0);
              glR.pushQuad(wx + 2, wy + 3, tileSize - 4, 6, 0.45, 0.32, 0.22, 1.0);
              glR.pushQuad(wx + 1, wy - 1, tileSize - 2, tileSize * 0.35, kCol[0], kCol[1], kCol[2], 1.0);
            } else if (tier === 3) {
              glR.pushQuad(wx + 1, wy + 4, tileSize - 2, tileSize - 6, 0.4, 0.42, 0.45, 1.0);
              glR.pushQuad(wx, wy - 2, tileSize, tileSize * 0.4, kCol[0], kCol[1], kCol[2], 1.0);
            } else {
              glR.pushQuad(wx, wy + 2, tileSize, tileSize - 4, 0.3, 0.32, 0.35, 1.0);
              glR.pushQuad(wx - 1, wy - 4, tileSize + 2, tileSize * 0.45, kCol[0], kCol[1], kCol[2], 1.0);
              glR.pushQuad(wx + tileSize * 0.35, wy - 7, tileSize * 0.3, 4, 0.9, 0.8, 0.2, 1.0);
            }
          } else {
            glR.pushQuad(wx + 3, wy + tileSize * 0.7, tileSize - 4, tileSize * 0.25, 0.0, 0.0, 0.0, 0.3);
            glR.pushQuad(wx + 2, wy + 4, tileSize - 4, tileSize - 6, 0.26, 0.26, 0.26, 1.0);
            glR.pushQuad(wx + 1, wy, tileSize - 2, tileSize * 0.4, kCol[0], kCol[1], kCol[2], 1.0);
            glR.pushQuad(wx + tileSize * 0.4, wy + tileSize * 0.6, tileSize * 0.2, tileSize * 0.35, 0.07, 0.07, 0.07, 1.0);
          }

          if (town.isCapital && b.type === 'TOWN_HALL') {
            glR.pushQuad(wx + tileSize * 0.3, wy - 8, tileSize * 0.4, 6, 1.0, 0.84, 0.0, 1.0);
          }
        });

        if (town.siegeTimer > 0 && town.siegeDuration > 0) {
          const wx = town.x * tileSize;
          const wy = town.y * tileSize;
          glR.pushQuad(wx - 4, wy - 10, tileSize + 8, 4, 0.0, 0.0, 0.0, 0.8);
          glR.pushQuad(wx - 4, wy - 10, (tileSize + 8) * (town.siegeTimer / town.siegeDuration), 4, 0.9, 0.1, 0.1, 1.0);
        }
      });

      this.units.forEach(u => {
        const wx = u.x * tileSize;
        const wy = u.y * tileSize;
        const raceHex = CONFIG.RACES[u.raceKey] ? CONFIG.RACES[u.raceKey].color : '#ffffff';
        const rCol = this.parseColor(raceHex);

        const isChild = u.job === 'CHILD';
        const renderSize = isChild ? tileSize * 0.7 : tileSize;
        const offsetY = isChild ? tileSize * 0.3 : 0;

        glR.pushQuad(wx + tileSize * 0.2, wy + tileSize * 0.8, renderSize * 0.6, renderSize * 0.2, 0.0, 0.0, 0.0, 0.35);

        if (u.type === 'FISHING_BOAT') {
          glR.pushQuad(wx + 2, wy + tileSize * 0.4, tileSize - 4, tileSize * 0.3, 0.55, 0.43, 0.39, 1.0);
          glR.pushQuad(wx + tileSize * 0.4, wy + tileSize * 0.15, tileSize * 0.2, tileSize * 0.35, 0.8, 0.8, 0.8, 1.0);
        } else if (u.type === 'FISHERMAN') {
          glR.pushQuad(wx + 2, wy + tileSize * 0.35, tileSize - 4, tileSize * 0.35, 0.45, 0.38, 0.32, 1.0);
          glR.pushQuad(wx + tileSize * 0.3, wy + tileSize * 0.15, tileSize * 0.4, tileSize * 0.3, 0.9, 0.9, 0.9, 1.0);
        } else if (u.isNaval) {
          glR.pushQuad(wx + 2, wy + tileSize * 0.3, tileSize - 4, tileSize * 0.4, 0.22, 0.28, 0.31, 1.0);
          glR.pushQuad(wx + tileSize * 0.35, wy + tileSize * 0.1, tileSize * 0.3, tileSize * 0.25, rCol[0], rCol[1], rCol[2], 1.0);
        } else {
          glR.pushQuad(wx + renderSize * 0.3, wy + offsetY + renderSize * 0.35, renderSize * 0.4, renderSize * 0.4, rCol[0], rCol[1], rCol[2], 1.0);
          glR.pushQuad(wx + renderSize * 0.35, wy + offsetY + renderSize * 0.15, renderSize * 0.3, renderSize * 0.25, 1.0, 0.88, 0.7, 1.0);

          if (u.job === 'ARMY_MAN') {
            glR.pushQuad(wx + renderSize * 0.7, wy + offsetY + renderSize * 0.2, renderSize * 0.15, renderSize * 0.5, 0.58, 0.64, 0.72, 1.0);
          } else if (u.job === 'MINER') {
            glR.pushQuad(wx + renderSize * 0.7, wy + offsetY + renderSize * 0.35, renderSize * 0.15, renderSize * 0.3, 0.39, 0.45, 0.55, 1.0);
          } else if (u.job === 'TREE_CHOPPER') {
            glR.pushQuad(wx + renderSize * 0.7, wy + offsetY + renderSize * 0.35, renderSize * 0.15, renderSize * 0.3, 0.55, 0.43, 0.39, 1.0);
          } else if (u.job === 'HOUSE_BUILDER') {
            glR.pushQuad(wx + renderSize * 0.7, wy + offsetY + renderSize * 0.35, renderSize * 0.15, renderSize * 0.3, 0.85, 0.47, 0.02, 1.0);
          } else if (u.job === 'CITY_STARTER') {
            glR.pushQuad(wx + renderSize * 0.2, wy + offsetY - renderSize * 0.2, renderSize * 0.6, renderSize * 0.35, 0.9, 0.6, 0.1, 1.0);
          } else if (u.job === 'PRINCE') {
            glR.pushQuad(wx + renderSize * 0.3, wy + offsetY - renderSize * 0.25, renderSize * 0.4, renderSize * 0.25, 1.0, 0.84, 0.0, 1.0);
          } else if (u.job === 'FISHERMAN') {
            glR.pushQuad(wx + renderSize * 0.7, wy + offsetY + renderSize * 0.35, renderSize * 0.15, renderSize * 0.3, 0.2, 0.7, 0.9, 1.0);
          }

          if (u.carryingWood > 0 || u.hasBuildingWood) {
            glR.pushQuad(wx + renderSize * 0.1, wy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25, 0.55, 0.43, 0.39, 1.0);
          } else if (u.carryingStone > 0) {
            glR.pushQuad(wx + renderSize * 0.1, wy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25, 0.6, 0.6, 0.6, 1.0);
          } else if (u.carryingGold > 0) {
            glR.pushQuad(wx + renderSize * 0.1, wy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25, 0.9, 0.75, 0.1, 1.0);
          } else if (u.carryingIron > 0) {
            glR.pushQuad(wx + renderSize * 0.1, wy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25, 0.7, 0.3, 0.2, 1.0);
          } else if (u.carryingFood > 0) {
            glR.pushQuad(wx + renderSize * 0.1, wy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25, 0.2, 0.7, 0.9, 1.0);
          }
        }

        if (u.carryingFood > 0 && u.isNaval) {
          glR.pushQuad(wx + tileSize * 0.1, wy + tileSize * 0.1, tileSize * 0.25, tileSize * 0.25, 0.2, 0.7, 0.9, 1.0);
        }

        if (u.selected) {
          glR.pushQuad(wx, wy, tileSize, 2, 1.0, 1.0, 1.0, 1.0);
          glR.pushQuad(wx, wy + tileSize - 2, tileSize, 2, 1.0, 1.0, 1.0, 1.0);
          glR.pushQuad(wx, wy, 2, tileSize, 1.0, 1.0, 1.0, 1.0);
          glR.pushQuad(wx + tileSize - 2, wy, 2, tileSize, 1.0, 1.0, 1.0, 1.0);
        }

        if (u.hp < u.maxHp) {
          glR.pushQuad(wx, wy - 4, tileSize, 3, 0.0, 0.0, 0.0, 1.0);
          glR.pushQuad(wx, wy - 4, tileSize * (u.hp / u.maxHp), 3, 0.0, 0.9, 0.46, 1.0);
        }
      });

      this.projectiles.forEach(p => {
        const wx = p.x * tileSize;
        const wy = p.y * tileSize;
        const sz = p.type === 'NUKE' ? 8 : 4;
        glR.pushQuad(wx - sz / 2, wy - sz / 2, sz, sz, 1.0, 0.92, 0.0, 1.0);
      });

      this.fx.forEach(f => {
        const wx = f.x * tileSize;
        const wy = f.y * tileSize;
        if (f.isChop) {
          const col = this.parseColor(f.color || '#8d6e63');
          glR.pushQuad(wx, wy, 3, 3, col[0], col[1], col[2], 1.0);
        } else {
          const r = f.radius * tileSize * (1 - f.life);
          if (f.isNuke) {
            glR.pushQuad(wx - r, wy - r, r * 2, r * 2, 1.0, 0.39, 0.0, f.life * 0.7);
          } else {
            glR.pushQuad(wx - r, wy - r, r * 2, r * 2, 1.0, 0.92, 0.23, f.life * 0.6);
          }
        }
      });

      this.clouds.forEach(c => {
        const cx = c.x * tileSize;
        const cy = c.y * tileSize;
        const unitW = (c.scale || 2) * tileSize;
        const unitH = unitW * 0.5;

        glR.pushQuad(cx + unitW * 0.2, cy, unitW * 0.6, unitH * 0.4, 1.0, 1.0, 1.0, 0.28);
        glR.pushQuad(cx + unitW * 0.1, cy + unitH * 0.3, unitW * 0.8, unitH * 0.4, 1.0, 1.0, 1.0, 0.28);
        glR.pushQuad(cx, cy + unitH * 0.6, unitW, unitH * 0.4, 1.0, 1.0, 1.0, 0.28);
        glR.pushQuad(cx, cy + unitH * 0.85, unitW, unitH * 0.15, 0.8, 0.83, 0.88, 0.22);

        if (c.isRaining) {
          for (let i = 0; i < 4; i++) {
            const rx = cx + (i * 0.22 + 0.08) * unitW;
            const ry = cy + unitH + (Math.floor(Date.now() / 120 + i) % 3) * 4;
            glR.pushQuad(rx, ry, 2, 6, 0.38, 0.65, 0.98, 0.45);
          }
        }
      });

      if (this.isMouseDown && this.activeTool === 'SELECT' && this.dragStart && !this.isRightDrag) {
        const p1 = this.screenToWorld(Math.min(this.dragStart.x, this.currentMousePos.x), Math.min(this.dragStart.y, this.currentMousePos.y));
        const p2 = this.screenToWorld(Math.max(this.dragStart.x, this.currentMousePos.x), Math.max(this.dragStart.y, this.currentMousePos.y));
        const boxW = Math.max(1, (p2.x - p1.x) * tileSize);
        const boxH = Math.max(1, (p2.y - p1.y) * tileSize);
        glR.pushQuad(p1.x * tileSize, p1.y * tileSize, boxW, boxH, 0.23, 0.51, 0.96, 0.15);
      }

      glR.end();
      return;
    }

    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const tileSize = CONFIG.TILE_SIZE * this.camera.zoom;
    const startTileX = Math.max(0, Math.floor(this.camera.x / tileSize));
    const startTileY = Math.max(0, Math.floor(this.camera.y / tileSize));
    const endTileX = Math.min(this.world.width, Math.ceil((this.camera.x + this.canvas.width) / tileSize));
    const endTileY = Math.min(this.world.height, Math.ceil((this.camera.y + this.canvas.height) / tileSize));

    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const idx = y * this.world.width + x;
        const tile = this.world.getTile(x, y);
        const screenX = x * tileSize - this.camera.x;
        const screenY = y * tileSize - this.camera.y;

        const baseColor = CONFIG.TILE_COLORS[tile] || '#000';
        const heightFactor = Math.max(0.7, Math.min(1.25, 0.75 + this.world.heightMap[idx] * 0.5 + this.world.tileNoise[idx]));

        this.ctx.fillStyle = this.adjustColor(baseColor, heightFactor);
        this.ctx.fillRect(screenX, screenY, tileSize + 0.5, tileSize + 0.5);

        if (tile === CONFIG.TILES.DEEP_WATER || tile === CONFIG.TILES.SHALLOW_WATER) {
          const hash = Math.sin(x * 12.9898 + y * 78.233 + Math.floor(this.waterPhase * 0.1) * 43.758);
          const randVal = hash - Math.floor(hash);
          if (randVal > 0.982) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            const sparkX = screenX + ((randVal * 100) % 1) * (tileSize - 2);
            const sparkY = screenY + ((randVal * 1000) % 1) * (tileSize - 2);
            const sparkSize = Math.max(1, tileSize * 0.15);
            this.ctx.fillRect(sparkX, sparkY, sparkSize, sparkSize);
          }
        }

        const kingdomKey = this.world.kingdomOwner[idx];
        if (kingdomKey && CONFIG.KINGDOM_COLORS[kingdomKey]) {
          this.ctx.fillStyle = CONFIG.KINGDOM_COLORS[kingdomKey].border;
          this.ctx.fillRect(screenX, screenY, tileSize, tileSize);
        }

        const falloutVal = this.world.fallout[idx];
        if (falloutVal > 0) {
          this.ctx.fillStyle = `rgba(140, 230, 80, ${falloutVal / 350})`;
          this.ctx.fillRect(screenX, screenY, tileSize, tileSize);
        }

        const resNodeCanvas = this.world.resources[idx];
        if (resNodeCanvas && resNodeCanvas.amount > 0 && (resNodeCanvas.nodeType === 'TREE' || resNodeCanvas.type === 'wood' || tile === CONFIG.TILES.FOREST)) {
          this.renderPixelTree(screenX, screenY, tileSize);
        }
      }
    }

    this.towns.forEach(town => {
      const kColor = CONFIG.KINGDOM_COLORS[town.kingdomKey] ? CONFIG.KINGDOM_COLORS[town.kingdomKey].primary : '#fff';

      town.buildings.forEach(b => {
        const sx = b.x * tileSize - this.camera.x;
        const sy = b.y * tileSize - this.camera.y;
        this.renderPixelBuilding(sx, sy, tileSize, b, kColor);
      });
    });

    this.units.forEach(u => {
      const sx = u.x * tileSize - this.camera.x;
      const sy = u.y * tileSize - this.camera.y;
      const raceColor = CONFIG.RACES[u.raceKey] ? CONFIG.RACES[u.raceKey].color : '#ffffff';
      this.renderPixelCreature(sx, sy, tileSize, u, raceColor);
    });

    this.projectiles.forEach(p => {
      const sx = p.x * tileSize - this.camera.x;
      const sy = p.y * tileSize - this.camera.y;
      this.ctx.fillStyle = '#ffea00';
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, p.type === 'NUKE' ? 7 : 4, 0, Math.PI * 2);
      this.ctx.fill();
    });

    this.fx.forEach(f => {
      const sx = f.x * tileSize - this.camera.x;
      const sy = f.y * tileSize - this.camera.y;
      if (f.isChop) {
        this.ctx.fillStyle = f.color;
        this.ctx.fillRect(sx, sy, 3, 3);
      } else {
        const r = f.radius * tileSize * (1 - f.life);
        this.ctx.fillStyle = f.isNuke ? `rgba(255, 100, 0, ${f.life * 0.7})` : `rgba(255, 235, 59, ${f.life * 0.6})`;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, r, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.renderScrollingClouds(tileSize);

    if (this.isMouseDown && this.activeTool === 'SELECT' && this.dragStart && !this.isRightDrag) {
      const sx = Math.min(this.dragStart.x, this.currentMousePos.x);
      const sy = Math.min(this.dragStart.y, this.currentMousePos.y);
      const w = Math.abs(this.dragStart.x - this.currentMousePos.x);
      const h = Math.abs(this.dragStart.y - this.currentMousePos.y);

      this.ctx.strokeStyle = '#3b82f6';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(sx, sy, w, h);
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      this.ctx.fillRect(sx, sy, w, h);
    }
  }

  renderScrollingClouds(tileSize) {
    this.clouds.forEach(c => {
      const sx = c.x * tileSize - this.camera.x;
      const sy = c.y * tileSize - this.camera.y;

      const unitW = (c.scale || 2) * tileSize;
      const unitH = unitW * 0.5;

      if (sx < -unitW || sx > this.canvas.width + unitW || sy < -unitH || sy > this.canvas.height + unitH) return;

      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      this.ctx.fillRect(sx + unitW * 0.2, sy, unitW * 0.6, unitH * 0.4);
      this.ctx.fillRect(sx + unitW * 0.1, sy + unitH * 0.3, unitW * 0.8, unitH * 0.4);
      this.ctx.fillRect(sx, sy + unitH * 0.6, unitW, unitH * 0.4);

      this.ctx.fillStyle = 'rgba(203, 213, 225, 0.22)';
      this.ctx.fillRect(sx, sy + unitH * 0.85, unitW, unitH * 0.15);

      if (c.isRaining) {
        this.ctx.fillStyle = 'rgba(96, 165, 250, 0.45)';
        for (let i = 0; i < 4; i++) {
          const rx = sx + (i * 0.22 + 0.08) * unitW;
          const ry = sy + unitH + (Math.floor(Date.now() / 120 + i) % 3) * 4;
          this.ctx.fillRect(rx, ry, 2, 6);
        }
      }
    });
  }

  adjustColor(hex, factor) {
    let r = parseInt(hex.substr(1, 2), 16);
    let g = parseInt(hex.substr(3, 2), 16);
    let b = parseInt(hex.substr(5, 2), 16);

    r = Math.min(255, Math.max(0, Math.round(r * factor)));
    g = Math.min(255, Math.max(0, Math.round(g * factor)));
    b = Math.min(255, Math.max(0, Math.round(b * factor)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  renderPixelTree(sx, sy, size) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    this.ctx.beginPath();
    this.ctx.ellipse(sx + size / 2, sy + size * 0.85, size * 0.35, size * 0.15, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#5d4037';
    this.ctx.fillRect(sx + size * 0.4, sy + size * 0.5, size * 0.2, size * 0.4);

    this.ctx.fillStyle = '#1b5e20';
    this.ctx.beginPath();
    this.ctx.arc(sx + size / 2, sy + size * 0.4, size * 0.35, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#2e7d32';
    this.ctx.beginPath();
    this.ctx.arc(sx + size * 0.4, sy + size * 0.3, size * 0.2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  renderPixelBuilding(sx, sy, size, building, kColor) {
    if (!building.isCompleted) {
      this.ctx.strokeStyle = '#8d6e63';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(sx + 2, sy + 4, size - 4, size - 6);

      this.ctx.fillStyle = '#111111';
      this.ctx.fillRect(sx, sy - 5, size, 4);
      this.ctx.fillStyle = '#3b82f6';
      this.ctx.fillRect(sx, sy - 5, size * (building.progress / 100), 4);
      return;
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(sx + 3, sy + size * 0.7, size - 4, size * 0.25);

    if (building.isHouse) {
      const tier = building.tier || 0;
      if (tier === 0) {
        this.ctx.fillStyle = '#d1c4e9';
        this.ctx.beginPath();
        this.ctx.moveTo(sx + size / 2, sy + 2);
        this.ctx.lineTo(sx + 3, sy + size - 2);
        this.ctx.lineTo(sx + size - 3, sy + size - 2);
        this.ctx.closePath();
        this.ctx.fill();
        return;
      } else if (tier === 1) {
        this.ctx.fillStyle = '#795548';
        this.ctx.fillRect(sx + 2, sy + 4, size - 4, size - 6);
      } else if (tier === 2) {
        this.ctx.fillStyle = '#78909c';
        this.ctx.fillRect(sx + 2, sy + 6, size - 4, size - 8);
        this.ctx.fillStyle = '#5d4037';
        this.ctx.fillRect(sx + 3, sy + 2, size - 6, 4);
      } else if (tier === 3) {
        this.ctx.fillStyle = '#546e7a';
        this.ctx.fillRect(sx + 1, sy + 4, size - 2, size - 6);
      } else {
        this.ctx.fillStyle = '#37474f';
        this.ctx.fillRect(sx, sy + 2, size, size - 4);
        this.ctx.fillStyle = '#fbc02d';
        this.ctx.fillRect(sx + size * 0.35, sy - 5, size * 0.3, 4);
      }
    } else {
      this.ctx.fillStyle = '#424242';
      this.ctx.fillRect(sx + 2, sy + 4, size - 4, size - 6);
    }

    this.ctx.fillStyle = kColor;
    this.ctx.beginPath();
    this.ctx.moveTo(sx + size / 2, sy);
    this.ctx.lineTo(sx + 1, sy + size * 0.4);
    this.ctx.lineTo(sx + size - 1, sy + size * 0.4);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = '#111111';
    this.ctx.fillRect(sx + size * 0.4, sy + size * 0.6, size * 0.2, size * 0.35);
  }

  renderPixelCreature(sx, sy, size, u, raceColor) {
    const isChild = u.job === 'CHILD';
    const renderSize = isChild ? size * 0.7 : size;
    const offsetY = isChild ? size * 0.3 : 0;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(sx + size / 2, sy + size * 0.85, renderSize * 0.3, renderSize * 0.12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    if (u.isNaval) {
      this.ctx.fillStyle = '#37474f';
      this.ctx.fillRect(sx + 2, sy + size * 0.3, size - 4, size * 0.4);
      this.ctx.fillStyle = raceColor;
      this.ctx.fillRect(sx + size * 0.35, sy + size * 0.1, size * 0.3, size * 0.25);
    } else {
      this.ctx.fillStyle = raceColor;
      this.ctx.fillRect(sx + renderSize * 0.3, sy + offsetY + renderSize * 0.35, renderSize * 0.4, renderSize * 0.4);

      this.ctx.fillStyle = '#ffe0b2';
      this.ctx.fillRect(sx + renderSize * 0.35, sy + offsetY + renderSize * 0.15, renderSize * 0.3, renderSize * 0.25);

      if (u.job === 'ARMY_MAN') {
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillRect(sx + renderSize * 0.7, sy + offsetY + renderSize * 0.2, renderSize * 0.15, renderSize * 0.5);
      } else if (u.job === 'MINER') {
        this.ctx.fillStyle = '#64748b';
        this.ctx.fillRect(sx + renderSize * 0.7, sy + offsetY + renderSize * 0.35, renderSize * 0.15, renderSize * 0.3);
      } else if (u.job === 'TREE_CHOPPER') {
        this.ctx.fillStyle = '#8d6e63';
        this.ctx.fillRect(sx + renderSize * 0.7, sy + offsetY + renderSize * 0.35, renderSize * 0.15, renderSize * 0.3);
      } else if (u.job === 'HOUSE_BUILDER') {
        this.ctx.fillStyle = '#d97706';
        this.ctx.fillRect(sx + renderSize * 0.7, sy + offsetY + renderSize * 0.35, renderSize * 0.15, renderSize * 0.3);
      }

      if (u.carryingWood > 0 || u.hasBuildingWood) {
        this.ctx.fillStyle = '#8d6e63';
        this.ctx.fillRect(sx + renderSize * 0.1, sy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25);
      } else if (u.carryingStone > 0) {
        this.ctx.fillStyle = '#9e9e9e';
        this.ctx.fillRect(sx + renderSize * 0.1, sy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25);
      } else if (u.carryingGold > 0) {
        this.ctx.fillStyle = '#eab308';
        this.ctx.fillRect(sx + renderSize * 0.1, sy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25);
      } else if (u.carryingIron > 0) {
        this.ctx.fillStyle = '#b91c1c';
        this.ctx.fillRect(sx + renderSize * 0.1, sy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25);
      } else if (u.carryingFood > 0) {
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillRect(sx + renderSize * 0.1, sy + offsetY + renderSize * 0.1, renderSize * 0.25, renderSize * 0.25);
      }
    }

    if (u.selected) {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(sx, sy, size, size);
    }

    if (u.hp < u.maxHp) {
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(sx, sy - 4, size, 3);
      this.ctx.fillStyle = '#00e676';
      this.ctx.fillRect(sx, sy - 4, size * (u.hp / u.maxHp), 3);
    }
  }

  start() {
    let lastTime = performance.now();
    const interval = 1000 / CONFIG.TICKS_PER_SEC;

    const loop = (now) => {
      const delta = now - lastTime;
      if (delta >= interval) {
        this.update();
        lastTime = now - (delta % interval);
      }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
