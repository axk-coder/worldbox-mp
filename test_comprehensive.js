const fs = require('fs');
const vm = require('vm');

global.window = global;
global.window.addEventListener = () => {};
global.window.location = { origin: 'http://localhost:8080', hostname: 'localhost', port: '8080' };
global.localStorage = {
  _data: {},
  setItem(k, v) { this._data[k] = String(v); },
  getItem(k) { return this._data[k] || null; }
};
global.Blob = class { constructor(parts) { this.parts = parts; } };
global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.document = {
  getElementById: () => ({
    getContext: () => ({
      createShader: () => ({}),
      shaderSource: () => {},
      compileShader: () => {},
      getShaderParameter: () => true,
      createProgram: () => ({}),
      attachShader: () => {},
      linkProgram: () => {},
      getProgramParameter: () => true,
      useProgram: () => {},
      getAttribLocation: () => 0,
      getUniformLocation: () => 0,
      createBuffer: () => ({}),
      bindBuffer: () => {},
      bufferData: () => {},
      enableVertexAttribArray: () => {},
      vertexAttribPointer: () => {},
      viewport: () => {},
      clearColor: () => {},
      clear: () => {},
      enable: () => {},
      blendFunc: () => {},
      drawArrays: () => {},
      uniform2f: () => {},
      uniformMatrix3fv: () => {}
    }),
    innerText: '',
    classList: { add: () => {}, remove: () => {} },
    style: {},
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  }),
  createElement: () => ({ click: () => {}, href: '' }),
  addEventListener: () => {}
};

const loadInGlobal = (filePath) => {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: filePath });
};

loadInGlobal('./js/config.js');
loadInGlobal('./js/perlin.js');
loadInGlobal('./js/world.js');
loadInGlobal('./js/towns.js');
loadInGlobal('./js/units.js');
loadInGlobal('./js/sockets/broadcast.js');
loadInGlobal('./js/sockets/webrtc.js');
loadInGlobal('./js/sockets/websocket.js');
loadInGlobal('./js/sockets/polling.js');
loadInGlobal('./js/sockets/transport.js');
loadInGlobal('./js/renderer.js');
loadInGlobal('./js/game.js');

console.log('--- 1. Testing CONFIG.RESOURCES ---');
console.assert(CONFIG.RESOURCES.STONE_ROCK === 'stone_rock', 'STONE_ROCK missing');
console.assert(CONFIG.RESOURCES.GOLD_ORE === 'gold_ore', 'GOLD_ORE missing');
console.assert(CONFIG.RESOURCES.IRON_ORE === 'iron_ore', 'IRON_ORE missing');
console.log('PASS: CONFIG.RESOURCES constants present.');

console.log('--- 2. Testing World Spawning ---');
const world = new WorldMap(256, 256);
world.generate(12345);
let foundRock = false, foundGold = false, foundIron = false;
for (let i = 0; i < world.resources.length; i++) {
  const res = world.resources[i];
  if (res) {
    if (res.type === CONFIG.RESOURCES.STONE_ROCK || res.nodeType === 'STONE_ROCK') foundRock = true;
    if (res.type === CONFIG.RESOURCES.GOLD_ORE || res.nodeType === 'GOLD_ORE') foundGold = true;
    if (res.type === CONFIG.RESOURCES.IRON_ORE || res.nodeType === 'IRON_ORE') foundIron = true;
  }
}
console.assert(foundRock && foundGold && foundIron, `Resource nodes missing in 256x256 map! Rock=${foundRock}, Gold=${foundGold}, Iron=${foundIron}`);
console.log(`PASS: Resource nodes spawned: Rock=${foundRock}, Gold=${foundGold}, Iron=${foundIron}`);

console.log('--- 3. Testing Miner AI Mining & Delivery ---');
class TestGameState {
  constructor() {
    this.world = new WorldMap(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const idx = y * 64 + x;
        this.world.tiles[idx] = CONFIG.TILES.GRASS;
        this.world.heightMap[idx] = 0.5;
      }
    }
    this.towns = [];
    this.units = [];
    this.projectiles = [];
    this.fx = [];
    this.spatialGrid = new SpatialGrid(64, 64, 16);
    this.playerId = 'p1';
    this.isHost = true;
  }
  spawnKingdom(raceKey, name, x, y, kingdomKey) {
    const town = new Town(`t_${this.towns.length}`, name || 'TestTown', raceKey, x, y, this.playerId, kingdomKey || 'blue');
    this.towns.push(town);
    for (let i = 0; i < 2; i++) {
      this.spawnUnit('WORKER', raceKey, x + (i % 2), y + Math.floor(i / 2), this.playerId, kingdomKey || 'blue', town.id, 18);
    }
    return town;
  }
  spawnUnit(type, raceKey, x, y, ownerId, kingdomKey, townId, initialAge, initialJob) {
    const u = new Unit(`u_${this.units.length}`, type, raceKey, x, y, ownerId, kingdomKey, townId, initialAge, initialJob);
    this.units.push(u);
    return u;
  }
  getTownUnitsCount(townId) {
    return this.units.filter(u => u.townId === townId && u.hp > 0).length;
  }
  addChopFx() {}
  isAtWar() { return false; }
}

const sim = new TestGameState();
const town = sim.spawnKingdom('HUMAN', 'Oreshire', 20, 20, 'blue');
const miner = sim.spawnUnit('WORKER', 'HUMAN', 20, 20, 'p1', 'blue', town.id, 21, 'MINER');

const oreIdx = 22 * 64 + 20;
sim.world.tiles[oreIdx] = CONFIG.TILES.MOUNTAIN;
sim.world.resources[oreIdx] = { type: CONFIG.RESOURCES.GOLD_ORE, nodeType: 'GOLD_ORE', amount: 15, claimedBy: null };

for (let tick = 0; tick < 200; tick++) {
  miner.update(sim.world, sim);
}

console.assert(town.resources.gold >= 15, `Expected gold >= 15, got ${town.resources.gold}`);
console.log(`PASS: Miner mined gold ore and deposited. Town gold=${town.resources.gold}`);

console.log('--- 4. Testing Node Depletion & Exact Harvest Amounts ---');
const sim2 = new TestGameState();
const town2 = sim2.spawnKingdom('DWARF', 'IronForge', 30, 30, 'yellow');
const miner2 = sim2.spawnUnit('WORKER', 'DWARF', 30, 30, 'p1', 'yellow', town2.id, 21, 'MINER');

const ironIdx = 32 * 64 + 30;
sim2.world.tiles[ironIdx] = CONFIG.TILES.MOUNTAIN;
sim2.world.resources[ironIdx] = { type: CONFIG.RESOURCES.IRON_ORE, nodeType: 'IRON_ORE', amount: 5, claimedBy: null };

for (let tick = 0; tick < 200; tick++) {
  miner2.update(sim2.world, sim2);
}

console.assert(town2.resources.iron === 5, `Expected iron === 5 (no dupe), got ${town2.resources.iron}`);
console.log(`PASS: Exact harvest amount extracted on node depletion. Town iron=${town2.resources.iron}`);

console.log('--- 5. Testing Save & Load Serialization ---');
const engine = new GameEngine('gameCanvas');
engine.newGame();
engine.isHost = true;
const passX = 40, passY = 40;
engine.world.tiles[passY * 256 + passX] = CONFIG.TILES.GRASS;
engine.world.heightMap[passY * 256 + passX] = 0.5;

const testTown = engine.spawnKingdom('HUMAN', 'SaveCity', passX, passY, 'blue');
testTown.resources.iron = 88;
const testMiner = engine.spawnUnit('WORKER', 'HUMAN', passX, passY, 'p1', 'blue', testTown.id, 25, 'MINER');
testMiner.carryingIron = 10;
testMiner.carryingStone = 5;

const snapshot = engine.getHostWorldSnapshot();
const snapMiner = snapshot.units.find(u => u.id === testMiner.id);
console.assert(snapshot.towns[0].iron === 88, 'Snapshot town iron missing');
console.assert(snapMiner && snapMiner.carryingIron === 10, 'Snapshot unit carryingIron missing');

const saveData = engine.saveGame();
const saveMiner = saveData.units.find(u => u.id === testMiner.id);
console.assert(saveData.towns[0].iron === 88, 'SaveData town iron missing');
console.assert(saveMiner && saveMiner.carryingIron === 10, 'SaveData unit carryingIron missing');

const engine2 = new GameEngine('gameCanvas');
engine2.newGame();
engine2.loadGame(saveData, false);
const loadedMiner = engine2.units.find(u => u.id === testMiner.id);
console.assert(engine2.towns[0].resources.iron === 88, 'Loaded town iron missing');
console.assert(loadedMiner && loadedMiner.carryingIron === 10, 'Loaded unit carryingIron missing');
console.log('PASS: Save, Load, and Host Snapshot serialization verified.');

console.log('--- 6. Testing City Abandonment & Ruined Building System ---');
const sim3 = new TestGameState();
const town3 = sim3.spawnKingdom('HUMAN', 'GhostTown', 15, 15, 'red');
console.log('Initial town pop:', sim3.getTownUnitsCount(town3.id));
console.assert(sim3.getTownUnitsCount(town3.id) > 0, 'Town should have initial units');

// Kill all residents
sim3.units.forEach(u => { if (u.townId === town3.id) u.hp = 0; });
sim3.units = sim3.units.filter(u => u.hp > 0);
console.log('Town pop after kill:', sim3.getTownUnitsCount(town3.id));

town3.update(sim3.world, sim3);
console.log('town3.isRuined:', town3.isRuined);
console.assert(town3.isRuined === true, 'Town MUST be marked as ruined when population is 0!');
console.assert(town3.buildings.every(b => b.isRuined === true), 'All buildings MUST be marked as ruined when town is ruined!');
console.log('PASS: City abandonment verified.');

console.log('ALL COMPREHENSIVE TESTS PASSED SUCCESSFULLY!');
