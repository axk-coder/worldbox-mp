const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
global.localStorage = {
  _data: {},
  setItem(k, v) { this._data[k] = String(v); },
  getItem(k) { return this._data[k] || null; }
};
global.Blob = class { constructor(parts) { this.parts = parts; } };
global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
global.document = {
  getElementById: () => ({
    getContext: () => ({ clearRect: () => {}, fillStyle: '', fillRect: () => {} }),
    innerText: '',
    classList: { add: () => {}, remove: () => {} },
    style: {}
  }),
  createElement: () => ({ click: () => {}, href: '' }),
  addEventListener: () => {}
};

const loadInGlobal = (filePath) => {
  const code = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
  vm.runInThisContext(code, { filename: filePath });
};

loadInGlobal('js/config.js');
loadInGlobal('js/perlin.js');
loadInGlobal('js/world.js');
loadInGlobal('js/towns.js');
loadInGlobal('js/units.js');
loadInGlobal('js/game.js');

console.log('--- TEST 1: PRNG Siege Duration Bounds & Determinism ---');
const world = new WorldMap(64, 64);
world.generate(12345);

class MockGameState {
  constructor() {
    this.world = world;
    this.towns = [];
    this.units = [];
    this.projectiles = [];
    this.fx = [];
    this.spatialGrid = new SpatialGrid(64, 64, 16);
    this.playerId = 'p1';
    this.activeWars = new Set();
  }

  updateSpatialGrid() {
    this.spatialGrid.clear();
    this.units.forEach(u => this.spatialGrid.insert(u));
  }

  getTownUnitsCount(townId) {
    return this.units.filter(u => u.townId === townId && u.hp > 0).length;
  }

  isAtWar(k1, k2) {
    if (!k1 || !k2 || k1 === k2) return false;
    if (this.activeWars && this.activeWars.size > 0) {
      const pairKey = [k1, k2].sort().join(':');
      return this.activeWars.has(pairKey);
    }
    return true;
  }

  initiateWar(sourceKingdomKey, targetKingdomKey) {
    if (!sourceKingdomKey || !targetKingdomKey || sourceKingdomKey === targetKingdomKey) return;
    if (!this.activeWars) this.activeWars = new Set();
    this.activeWars.add([sourceKingdomKey, targetKingdomKey].sort().join(':'));
  }

  spawnKingdom(raceKey, name, x, y, kingdomKey) {
    const town = new Town(`t_${this.towns.length}`, name || 'TestTown', raceKey, x, y, this.playerId, kingdomKey || 'blue', this.towns.length === 0);
    this.towns.push(town);
    return town;
  }

  spawnUnit(type, raceKey, x, y, ownerId, kingdomKey, townId, initialAge, initialJob) {
    const u = new Unit(`u_${this.units.length}`, type, raceKey, x, y, ownerId, kingdomKey, townId, initialAge, initialJob);
    this.units.push(u);
    this.spatialGrid.insert(u);
    return u;
  }

  chooseNewCapital() {}
}

const game = new MockGameState();
const humanTown = game.spawnKingdom('HUMAN', 'Human Capital', 10, 10, 'human_k');
const orcTown = game.spawnKingdom('ORC', 'Orc Fortress', 40, 40, 'orc_k');
const elfTown = game.spawnKingdom('ELF', 'Elf Woods', 50, 10, 'elf_k');

game.initiateWar('orc_k', 'human_k');
game.initiateWar('elf_k', 'human_k');

console.assert(game.isAtWar('orc_k', 'human_k'), 'War check failed between orc and human');
console.assert(game.isAtWar('elf_k', 'human_k'), 'War check failed between elf and human');
console.assert(!game.isAtWar('orc_k', 'elf_k'), 'War check should be false between orc and elf');
console.log('PASS: War registration and check logic.');

console.log('--- TEST 2: Siege Start & PRNG Duration ---');
const orcArmy1 = game.spawnUnit('WORKER', 'ORC', 10, 10, 'p1', 'orc_k', orcTown.id, 25, 'ARMY_MAN');
const humanResident1 = game.spawnUnit('WORKER', 'HUMAN', 12, 12, 'p1', 'human_k', humanTown.id, 30, 'HOUSE_BUILDER');
const humanResident2 = game.spawnUnit('WORKER', 'HUMAN', 14, 14, 'p1', 'human_k', humanTown.id, 20, 'FARMER');

humanTown.update(world, game);
console.assert(humanTown.siegeTimer === 1, `siegeTimer should be 1, got ${humanTown.siegeTimer}`);
console.assert(humanTown.siegeDuration >= 200 && humanTown.siegeDuration <= 600, `siegeDuration should be between 200 and 600, got ${humanTown.siegeDuration}`);
console.assert(humanTown.siegeAttackerKingdom === 'orc_k', `siegeAttackerKingdom should be orc_k, got ${humanTown.siegeAttackerKingdom}`);
console.log(`PASS: Siege started with duration ${humanTown.siegeDuration} ticks (${humanTown.siegeDuration/20}s).`);

console.log('--- TEST 3: Unit AI Besieging State ---');
game.updateSpatialGrid();
orcArmy1.updateArmyManAI(world, game);
console.assert(orcArmy1.state === 'BESIEGING', `Unit state should be BESIEGING, got ${orcArmy1.state}`);
console.assert(orcArmy1.siegeTargetTownId === humanTown.id, `Unit siegeTargetTownId should be ${humanTown.id}, got ${orcArmy1.siegeTargetTownId}`);
console.assert(orcArmy1.siegeTimer === 1, `Unit siegeTimer should be 1, got ${orcArmy1.siegeTimer}`);
console.log('PASS: Unit AI transition to BESIEGING state.');

console.log('--- TEST 4: Invaders Driven Away Resets Siege ---');
orcArmy1.x = 40;
orcArmy1.y = 40;
game.updateSpatialGrid();
humanTown.update(world, game);
console.assert(humanTown.siegeTimer === 0, `siegeTimer should reset to 0 when invaders leave, got ${humanTown.siegeTimer}`);
console.assert(humanTown.siegeAttackerKingdom === null, `siegeAttackerKingdom should reset to null, got ${humanTown.siegeAttackerKingdom}`);

orcArmy1.updateArmyManAI(world, game);
console.assert(orcArmy1.state !== 'BESIEGING', `Unit state should leave BESIEGING when far from center`);
console.assert(orcArmy1.siegeTargetTownId === null, `Unit siegeTargetTownId should reset to null`);
console.log('PASS: Invaders driven away reset siege state in town and unit.');

console.log('--- TEST 5: Full Duration Siege & City Conquest + Resident Conversion ---');
orcArmy1.x = 10;
orcArmy1.y = 10;
game.updateSpatialGrid();

humanTown.update(world, game);
const fullDuration = humanTown.siegeDuration;
console.log(`Advancing ${fullDuration} ticks for full siege capture...`);

for (let tick = 2; tick <= fullDuration; tick++) {
  humanTown.update(world, game);
  orcArmy1.updateArmyManAI(world, game);
}

console.assert(humanTown.kingdomKey === 'orc_k', `Town kingdomKey should be orc_k, got ${humanTown.kingdomKey}`);
console.assert(humanTown.siegeTimer === 0, `Town siegeTimer should reset after conquest, got ${humanTown.siegeTimer}`);
console.assert(humanResident1.kingdomKey === 'orc_k', `Resident 1 kingdom should convert to orc_k, got ${humanResident1.kingdomKey}`);
console.assert(humanResident2.kingdomKey === 'orc_k', `Resident 2 kingdom should convert to orc_k, got ${humanResident2.kingdomKey}`);
console.assert(humanResident1.state === 'IDLE', `Resident 1 state should reset to IDLE, got ${humanResident1.state}`);
console.log('PASS: Town conquest, building transfer, resident conversion completed successfully.');

console.log('--- TEST 6: Multi-Kingdom Attacker Swap Collision ---');
const newHumanTown = game.spawnKingdom('HUMAN', 'New City', 25, 25, 'human_k2');
game.spawnUnit('WORKER', 'HUMAN', 25, 25, 'p1', 'human_k2', newHumanTown.id, 25, 'HOUSE_BUILDER');

game.initiateWar('orc_k', 'human_k2');
game.initiateWar('elf_k', 'human_k2');

const orcAttacker = game.spawnUnit('WORKER', 'ORC', 25, 25, 'p1', 'orc_k', orcTown.id, 22, 'ARMY_MAN');
const elfAttacker = game.spawnUnit('WORKER', 'ELF', 25, 25, 'p1', 'elf_k', elfTown.id, 22, 'ARMY_MAN');

game.updateSpatialGrid();
newHumanTown.update(world, game);
const firstAttacker = newHumanTown.siegeAttackerKingdom;
console.log(`First attacker registered: ${firstAttacker}`);
console.assert(firstAttacker !== null, 'firstAttacker should not be null');

for (let i = 0; i < 50; i++) {
  newHumanTown.update(world, game);
}

console.assert(newHumanTown.siegeTimer === 51, `Timer should be 51, got ${newHumanTown.siegeTimer}`);

if (firstAttacker === 'orc_k') {
  orcAttacker.hp = 0;
} else {
  elfAttacker.hp = 0;
}
game.units = game.units.filter(u => u.hp > 0);
game.updateSpatialGrid();

newHumanTown.update(world, game);
console.assert(newHumanTown.siegeAttackerKingdom !== firstAttacker, `Attacker should swap to surviving kingdom, got ${newHumanTown.siegeAttackerKingdom}`);
console.assert(newHumanTown.siegeTimer === 1, `Timer should reset to 1 on attacker swap, got ${newHumanTown.siegeTimer}`);
console.log('PASS: Multi-attacker collision correctly swapped attacker and reset timer.');

console.log('ALL SIEGE TESTS PASSED SUCCESSFULLY!');
