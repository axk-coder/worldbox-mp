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

    this.dragStart = null;
    this.currentMousePos = { x: 0, y: 0 };
    this.isMouseDown = false;
    this.isRightDrag = false;

    this.initCanvas();
    this.initEvents();
    this.initMultiplayer();
    this.newGame();
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
    this.world.generate();
    this.towns = [];
    this.units = [];
    this.projectiles = [];
    this.fx = [];

    this.spawnKingdom('HUMAN', 'Human Realm', 30, 30);
    this.spawnKingdom('ORC', 'Orc Horde', 130, 130);
    this.spawnKingdom('ELF', 'Elven Dominion', 30, 130);
    this.spawnKingdom('DWARF', 'Dwarven Hold', 130, 30);

    this.centerCameraOn(80, 80);
  }

  centerCameraOn(tx, ty) {
    this.camera.x = (tx * CONFIG.TILE_SIZE * this.camera.zoom) - (this.canvas.width / 2);
    this.camera.y = (ty * CONFIG.TILE_SIZE * this.camera.zoom) - (this.canvas.height / 2);
  }

  spawnKingdom(raceKey, name, x, y) {
    const raceConfig = CONFIG.RACES[raceKey] || CONFIG.RACES.HUMAN;
    const kingdomKey = raceConfig.kingdomKey;
    const tId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const town = new Town(tId, name, raceKey, x, y, this.playerId, kingdomKey);
    this.towns.push(town);

    for (let i = 0; i < 5; i++) {
      this.spawnUnit('WORKER', raceKey, x + (i % 3) - 1, y + Math.floor(i / 3) - 1, this.playerId, kingdomKey, tId);
    }
    for (let i = 0; i < 4; i++) {
      this.spawnUnit('INFANTRY', raceKey, x + (i % 2), y + 2, this.playerId, kingdomKey, tId);
    }
    for (let i = 0; i < 3; i++) {
      this.spawnUnit('ARCHER', raceKey, x + (i % 2) - 1, y - 2, this.playerId, kingdomKey, tId);
    }
    return town;
  }

  spawnUnit(type, raceKey, x, y, ownerId, kingdomKey = 'blue', townId = null) {
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
      this.world.tickFallout();
      this.towns.forEach(t => t.update(this.world, this));
      this.units.forEach(u => u.update(this.world, this));
      this.units = this.units.filter(u => u.hp > 0);
      this.projectiles.forEach(p => p.update(this.world, this));
      this.projectiles = this.projectiles.filter(p => !p.completed);

      this.fx.forEach(f => f.life -= 1 / (CONFIG.TICKS_PER_SEC * f.maxLife));
      this.fx = this.fx.filter(f => f.life > 0);
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

        this.ctx.fillStyle = CONFIG.TILE_COLORS[tile] || '#000';
        this.ctx.fillRect(screenX, screenY, tileSize + 0.5, tileSize + 0.5);

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
      }
    }

    this.towns.forEach(town => {
      const kColor = CONFIG.KINGDOM_COLORS[town.kingdomKey] ? CONFIG.KINGDOM_COLORS[town.kingdomKey].primary : '#fff';

      town.buildings.forEach(b => {
        const sx = b.x * tileSize - this.camera.x;
        const sy = b.y * tileSize - this.camera.y;

        this.ctx.fillStyle = kColor;
        this.ctx.fillRect(sx + 2, sy + 2, tileSize - 4, tileSize - 4);
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(sx + 2, sy + 2, tileSize - 4, tileSize - 4);
      });
    });

    this.units.forEach(u => {
      const sx = u.x * tileSize - this.camera.x;
      const sy = u.y * tileSize - this.camera.y;
      const raceColor = CONFIG.RACES[u.raceKey] ? CONFIG.RACES[u.raceKey].color : '#ffffff';

      if (u.isNaval) {
        this.ctx.fillStyle = '#455a64';
        this.ctx.beginPath();
        this.ctx.arc(sx + tileSize / 2, sy + tileSize / 2, tileSize * 0.45, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = raceColor;
        this.ctx.beginPath();
        this.ctx.arc(sx + tileSize / 2, sy + tileSize / 2, tileSize * 0.2, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        this.ctx.fillStyle = raceColor;
        this.ctx.beginPath();
        this.ctx.arc(sx + tileSize / 2, sy + tileSize / 2, tileSize * 0.35, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }

      if (u.selected) {
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(sx - 1, sy - 1, tileSize + 2, tileSize + 2);
      }

      if (u.hp < u.maxHp) {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(sx, sy - 4, tileSize, 3);
        this.ctx.fillStyle = '#00e676';
        this.ctx.fillRect(sx, sy - 4, tileSize * (u.hp / u.maxHp), 3);
      }
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
      const r = f.radius * tileSize * (1 - f.life);
      this.ctx.fillStyle = f.isNuke ? `rgba(255, 100, 0, ${f.life * 0.7})` : `rgba(255, 235, 59, ${f.life * 0.6})`;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, r, 0, Math.PI * 2);
      this.ctx.fill();
    });

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
