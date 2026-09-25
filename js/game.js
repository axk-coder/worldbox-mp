class GameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.world = new WorldMap();
    this.towns = [];
    this.units = [];
    this.projectiles = [];
    this.fx = [];
    this.socketManager = new MultiSocketManager();
    this.playerId = `player_${Math.floor(Math.random() * 9000 + 1000)}`;
    this.playerKingdom = 'blue';

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
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    return `${p} ${s}`;
  }

  initClouds() {
    this.clouds = [];
    for (let i = 0; i < 22; i++) {
      this.clouds.push({
        x: Math.random() * 2400,
        y: Math.random() * 2400,
        scale: 0.8 + Math.random() * 0.8,
        speed: 0.3 + Math.random() * 0.4,
        isRaining: Math.random() < 0.3,
        rainTimer: Math.floor(Math.random() * 300)
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
    const freshSeed = Math.floor(Math.random() * 9999999);
    this.world.generate(freshSeed);
    this.towns = [];
    this.units = [];
    this.projectiles = [];
    this.fx = [];

    this.centerCameraOn(80, 80);
  }

  centerCameraOn(tx, ty) {
    this.camera.x = (tx * CONFIG.TILE_SIZE * this.camera.zoom) - (this.canvas.width / 2);
    this.camera.y = (ty * CONFIG.TILE_SIZE * this.camera.zoom) - (this.canvas.height / 2);
  }

  spawnKingdom(raceKey, name, x, y) {
    if (!this.world.isPassable(x, y, false)) return null;

    const raceConfig = CONFIG.RACES[raceKey] || CONFIG.RACES.HUMAN;
    const kingdomKey = raceConfig.kingdomKey;
    const kingdomName = name || this.generateKingdomName(raceKey);
    const tId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const town = new Town(tId, kingdomName, raceKey, x, y, this.playerId, kingdomKey);
    this.towns.push(town);

    for (let i = 0; i < 3; i++) {
      this.spawnUnit('WORKER', raceKey, x + (i % 2), y + Math.floor(i / 2), this.playerId, kingdomKey, tId);
    }
    return town;
  }

  spawnUnit(type, raceKey, x, y, ownerId, kingdomKey = 'blue', townId = null) {
    const raceConfig = CONFIG.RACES[raceKey] || CONFIG.RACES.HUMAN;
    const isNaval = CONFIG.UNITS[type] ? CONFIG.UNITS[type].isNaval : false;
    if (!this.world.isPassable(x, y, isNaval)) return null;

    if (!townId && !isNaval) {
      let existingTown = this.towns.find(t => t.kingdomKey === kingdomKey && Math.hypot(t.x - x, t.y - y) < 20);
      if (!existingTown) {
        existingTown = this.spawnKingdom(raceKey, this.generateKingdomName(raceKey), x, y);
      }
      if (existingTown) townId = existingTown.id;
    }

    const uId = `u_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const unit = new Unit(uId, type, raceKey, x, y, ownerId, kingdomKey, townId);
    this.units.push(unit);
    return unit;
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
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + (Math.random() - 0.5) * 0.6,
        radius: 0.15,
        isChop: true,
        color: Math.random() > 0.5 ? '#8d6e63' : '#2e7d32',
        life: 0.4,
        maxLife: 0.4
      });
    }
  }

  initMultiplayer() {
    this.socketManager.init(CONFIG.SOCKET_TYPES.BROADCAST, 'LAN_ROOM_1', true);
    this.socketManager.onMessage((packet) => {
      this.handleNetworkPacket(packet);
    });
  }

  handleNetworkPacket(packet) {
    if (!packet || packet.sender === this.playerId) return;

    if (packet.type === 'UNIT_MOVE') {
      const u = this.units.find(item => item.id === packet.unitId);
      if (u) {
        u.setMoveTarget(packet.targetX, packet.targetY, this.world);
      }
    } else if (packet.type === 'SPAWN_STRIKE') {
      const pId = `p_${Date.now()}`;
      const proj = new Projectile(pId, packet.weaponType, packet.startX, packet.startY, packet.targetX, packet.targetY, packet.sender);
      this.projectiles.push(proj);
    } else if (packet.type === 'BRUSH_TERRAIN') {
      this.world.applyBrush(packet.x, packet.y, packet.radius, packet.tool);
    } else if (packet.type === 'SPAWN_CREATURE') {
      this.spawnUnit('INFANTRY', packet.raceKey, packet.x, packet.y, packet.sender, CONFIG.RACES[packet.raceKey].kingdomKey);
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
          const clickedUnit = this.units.find(u => Math.hypot(u.x - worldPos.x, u.y - worldPos.y) < 1.2);
          if (clickedUnit) {
            this.showCreatureInspector(clickedUnit);
          }
        } else if (this.activeTool === 'SELECT') {
          this.dragStart = { x: e.clientX, y: e.clientY };
        } else if (['RAISE_LAND', 'LOWER_LAND', 'PLANT_FOREST', 'BUILD_MOUNTAIN'].includes(this.activeTool)) {
          this.world.applyBrush(tx, ty, 3, this.activeTool);
          this.socketManager.send({ type: 'BRUSH_TERRAIN', x: tx, y: ty, radius: 3, tool: this.activeTool, sender: this.playerId });
        } else if (['BOMB', 'MISSILE', 'NUKE', 'ACID'].includes(this.activeTool)) {
          this.launchWeapon(this.activeTool, worldPos.x, worldPos.y);
        } else if (['SPAWN_HUMAN', 'SPAWN_ORC', 'SPAWN_ELF', 'SPAWN_DWARF'].includes(this.activeTool)) {
          const raceKey = this.activeTool.replace('SPAWN_', '');
          const kingdomKey = CONFIG.RACES[raceKey].kingdomKey;
          this.spawnUnit('INFANTRY', raceKey, tx, ty, this.playerId, kingdomKey);
          this.socketManager.send({ type: 'SPAWN_CREATURE', raceKey, x: tx, y: ty, sender: this.playerId });
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

      if (this.isMouseDown && ['RAISE_LAND', 'LOWER_LAND', 'PLANT_FOREST', 'BUILD_MOUNTAIN'].includes(this.activeTool)) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);
        const tx = Math.floor(worldPos.x);
        const ty = Math.floor(worldPos.y);
        this.world.applyBrush(tx, ty, 2, this.activeTool);
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
    document.getElementById('inspect-kingdom').innerText = CONFIG.KINGDOM_COLORS[unit.kingdomKey] ? CONFIG.KINGDOM_COLORS[unit.kingdomKey].name : unit.kingdomKey;
    document.getElementById('inspect-hp').innerText = `${Math.round(unit.hp)} / ${unit.maxHp}`;
    document.getElementById('inspect-atk').innerText = unit.stats.atk;
    document.getElementById('inspect-kills').innerText = unit.kills;
    document.getElementById('inspect-level').innerText = unit.level;
    document.getElementById('inspect-state').innerText = unit.state;

    modal.classList.remove('hidden');
  }

  finishBoxSelect(start, end) {
    const p1 = this.screenToWorld(Math.min(start.x, end.x), Math.min(start.y, end.y));
    const p2 = this.screenToWorld(Math.max(start.x, end.x), Math.max(start.y, end.y));

    if (Math.abs(start.x - end.x) < 6 && Math.abs(start.y - end.y) < 6) {
      const clickPos = this.screenToWorld(start.x, start.y);
      this.selectedUnits = this.units.filter(u => u.kingdomKey === this.playerKingdom && Math.hypot(u.x - clickPos.x, u.y - clickPos.y) < 1.2);
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
    const targetTileX = Math.floor(tx);
    const targetTileY = Math.floor(ty);
    const enemyUnit = this.units.find(u => u.kingdomKey !== this.playerKingdom && Math.hypot(u.x - tx, u.y - ty) < 1.5);

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

      this.socketManager.send({
        type: 'UNIT_MOVE',
        sender: this.playerId,
        unitId: unit.id,
        targetX: finalX,
        targetY: finalY
      });
    });
  }

  launchWeapon(weaponType, tx, ty) {
    const startX = tx;
    const startY = Math.max(0, ty - 18);
    const pId = `p_${Date.now()}`;
    const proj = new Projectile(pId, weaponType, startX, startY, tx, ty, this.playerId);
    this.projectiles.push(proj);

    this.socketManager.send({
      type: 'SPAWN_STRIKE',
      sender: this.playerId,
      weaponType,
      startX, startY,
      targetX: tx, targetY: ty
    });
  }

  update() {
    if (this.simSpeed === 0) return;

    for (let step = 0; step < this.simSpeed; step++) {
      this.waterPhase += 0.05;
      this.world.tickFallout();
      this.world.updateErosion();
      this.world.updateWaterFlow();

      this.towns.forEach(t => t.update(this.world, this));
      this.units.forEach(u => u.update(this.world, this));
      this.units = this.units.filter(u => u.hp > 0);
      this.projectiles.forEach(p => p.update(this.world, this));
      this.projectiles = this.projectiles.filter(p => !p.completed);

      this.fx.forEach(f => f.life -= 1 / (CONFIG.TICKS_PER_SEC * f.maxLife));
      this.fx = this.fx.filter(f => f.life > 0);

      this.clouds.forEach(c => {
        c.x += c.speed;
        c.y += c.speed * 0.3;
        if (c.x > 2600) c.x = -300;
        if (c.y > 2600) c.y = -300;

        c.rainTimer++;
        if (c.rainTimer > 250) {
          c.rainTimer = 0;
          c.isRaining = !c.isRaining;
        }

        if (c.isRaining && Math.random() < 0.15) {
          const worldPos = this.screenToWorld(
            (c.x * (this.camera.zoom * 0.5)) - (this.camera.x * 0.3),
            (c.y * (this.camera.zoom * 0.5)) - (this.camera.y * 0.3)
          );
          const rx = Math.floor(worldPos.x);
          const ry = Math.floor(worldPos.y);
          const tile = this.world.getTile(rx, ry);

          if (tile === CONFIG.TILES.GRASS && Math.random() < 0.15) {
            this.world.setTile(rx, ry, CONFIG.TILES.FOREST);
            this.world.resources[ry * this.world.width + rx] = { type: CONFIG.RESOURCES.WOOD, amount: 150 };
          } else if (tile === CONFIG.TILES.CRATER) {
            this.world.setTile(rx, ry, CONFIG.TILES.GRASS);
          }
        }
      });
    }
  }

  render() {
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
          const ripple = Math.sin(x * 0.4 + y * 0.4 + this.waterPhase) * 0.08 + 0.08;
          this.ctx.fillStyle = `rgba(255, 255, 255, ${ripple})`;
          this.ctx.fillRect(screenX, screenY, tileSize, tileSize);
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

        if (tile === CONFIG.TILES.FOREST) {
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
    const pw = 8 * this.camera.zoom;

    this.clouds.forEach(c => {
      const sx = Math.floor((c.x * (this.camera.zoom * 0.5)) - (this.camera.x * 0.3));
      const sy = Math.floor((c.y * (this.camera.zoom * 0.5)) - (this.camera.y * 0.3));

      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      this.ctx.fillRect(sx + pw * 2, sy, pw * 6, pw * 2);
      this.ctx.fillRect(sx + pw, sy + pw * 2, pw * 8, pw * 2);
      this.ctx.fillRect(sx, sy + pw * 4, pw * 10, pw * 2);

      this.ctx.fillStyle = 'rgba(203, 213, 225, 0.38)';
      this.ctx.fillRect(sx, sy + pw * 6, pw * 10, pw);
      this.ctx.fillRect(sx + pw, sy + pw * 7, pw * 8, pw);

      if (c.isRaining) {
        this.ctx.fillStyle = 'rgba(96, 165, 250, 0.6)';
        for (let i = 0; i < 4; i++) {
          const rx = sx + (i * 2 + 1) * pw;
          const ry = sy + pw * 8 + (Math.floor(Date.now() / 100 + i) % 3) * 6;
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

    this.ctx.fillStyle = '#424242';
    this.ctx.fillRect(sx + 2, sy + 4, size - 4, size - 6);

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
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(sx + size / 2, sy + size * 0.8, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    if (u.isNaval) {
      this.ctx.fillStyle = '#37474f';
      this.ctx.fillRect(sx + 2, sy + size * 0.3, size - 4, size * 0.4);
      this.ctx.fillStyle = raceColor;
      this.ctx.fillRect(sx + size * 0.35, sy + size * 0.1, size * 0.3, size * 0.25);
    } else {
      this.ctx.fillStyle = raceColor;
      this.ctx.fillRect(sx + size * 0.3, sy + size * 0.35, size * 0.4, size * 0.4);

      this.ctx.fillStyle = '#ffe0b2';
      this.ctx.fillRect(sx + size * 0.35, sy + size * 0.15, size * 0.3, size * 0.25);

      this.ctx.fillStyle = '#212121';
      this.ctx.fillRect(sx + size * 0.7, sy + size * 0.4, size * 0.15, size * 0.3);
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
