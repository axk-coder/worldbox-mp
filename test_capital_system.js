const fs = require('fs');
const vm = require('vm');

global.window = {
  addEventListener: () => {},
  innerWidth: 1024,
  innerHeight: 768
};
global.document = {
  getElementById: (id) => ({
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {} },
    innerText: '',
    style: {},
    getContext: () => null
  }),
  querySelectorAll: () => [],
  createElement: () => ({ addEventListener: () => {}, click: () => {} })
};
global.navigator = { userAgent: 'node' };
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Blob = class {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
global.WebGL2DRenderer = class { constructor() { this.gl = null; } begin() {} pushQuad() {} };
global.MultiSocketManager = class { constructor() { this.currentType = 'BROADCAST'; this.roomCode = 'TEST'; } init() {} onMessage() {} send() {} };

const files = [
  'js/config.js',
  'js/perlin.js',
  'js/world.js',
  'js/towns.js',
  'js/units.js',
  'js/weapons.js',
  'js/game.js'
];

files.forEach(f => {
  const code = fs.readFileSync(f, 'utf8');
  vm.runInThisContext(code, { filename: f });
});

console.log('Environment initialized successfully.');

const engine = new GameEngine('gameCanvas');
engine.simSpeed = 1;
engine.newGame();

for (let y = 0; y < 200; y++) {
  for (let x = 0; x < 200; x++) {
    engine.world.tiles[y * engine.world.width + x] = CONFIG.TILES.GRASS;
  }
}

console.log('--- TEST 1: First Town Designated as Capital ---');
const town1 = engine.spawnKingdom('HUMAN', 'Alpha Kingdom', 50, 50, 'blue');
if (!town1) throw new Error('Failed to spawn town 1');
if (!town1.isCapital) throw new Error(`First town must be Capital (got ${town1.isCapital})`);
if (town1.kingdomKey !== 'blue') throw new Error('Kingdom key must be blue');

console.log('--- TEST 2: Sub-Kingdom Cities Founded as Non-Capital ---');
const town2 = engine.spawnKingdom('HUMAN', 'Alpha Kingdom', 80, 80, 'blue');
if (!town2) throw new Error('Failed to spawn town 2');
if (town2.isCapital) throw new Error(`Subsequent town 2 must NOT be Capital (got ${town2.isCapital})`);

const town3 = engine.spawnKingdom('HUMAN', 'Alpha Kingdom', 110, 110, 'blue');
if (!town3) throw new Error('Failed to spawn town 3');
if (town3.isCapital) throw new Error(`Subsequent town 3 must NOT be Capital (got ${town3.isCapital})`);

console.log('--- TEST 3: Capital Re-election when Capital is Ruined ---');
for (let i = 0; i < 4; i++) {
  engine.spawnUnit('WORKER', 'HUMAN', 81, 81, engine.playerId, 'blue', town2.id);
}
for (let i = 0; i < 2; i++) {
  engine.spawnUnit('WORKER', 'HUMAN', 111, 111, engine.playerId, 'blue', town3.id);
}

const pop1 = engine.getTownUnitsCount(town1.id);
const pop2 = engine.getTownUnitsCount(town2.id);
const pop3 = engine.getTownUnitsCount(town3.id);
console.log(`Pops: Town 1=${pop1}, Town 2=${pop2}, Town 3=${pop3}`);

engine.units.filter(u => u.townId === town1.id).forEach(u => u.hp = 0);
engine.units = engine.units.filter(u => u.hp > 0);
town1.buildings = [];

town1.update(engine.world, engine);
console.log(`After Ruin: Town 1 isRuined=${town1.isRuined}, isCapital=${town1.isCapital}`);
console.log(`Town 2 isCapital=${town2.isCapital}`);
console.log(`Town 3 isCapital=${town3.isCapital}`);

if (!town1.isRuined) throw new Error('Town 1 should be ruined!');
if (town1.isCapital) throw new Error('Town 1 should no longer be capital!');
if (!town2.isCapital) throw new Error('Town 2 (highest pop) should be elected new capital!');
if (town3.isCapital) throw new Error('Town 3 should remain sub-kingdom city!');

console.log('--- TEST 4: Siege Conquest of Capital Re-evaluates Remaining Cities ---');
const enemyTown = engine.spawnKingdom('ORC', 'Orc Horde', 150, 150, 'red');
const invader = engine.spawnUnit('INFANTRY', 'ORC', 80, 80, 'enemy_player', 'red', enemyTown.id);
invader.job = 'ARMY_MAN';

engine.spatialGrid.clear();
engine.units.forEach(u => engine.spatialGrid.insert(u));

town2.siegeTimer = 999;
town2.siegeDuration = 1000;
town2.siegeAttackerKingdom = 'red';

town2.update(engine.world, engine);

console.log(`After Siege: Town 2 Kingdom=${town2.kingdomKey}, isCapital=${town2.isCapital}`);
console.log(`Town 3 Kingdom=${town3.kingdomKey}, isCapital=${town3.isCapital}`);

if (town2.kingdomKey !== 'red') throw new Error('Town 2 should belong to red kingdom!');
if (!town3.isCapital) throw new Error('Town 3 (remaining blue town) should be elected as new capital of blue kingdom!');

console.log('--- TEST 5: Weapon Explosion Destruction of Capital ---');
const town4 = engine.spawnKingdom('ELF', 'Sylvan Realm', 30, 30, 'green');
const town5 = engine.spawnKingdom('ELF', 'Sylvan Realm', 60, 60, 'green');
engine.spawnUnit('WORKER', 'ELF', 61, 61, engine.playerId, 'green', town5.id);

console.log(`Before weapon: Town 4 isCapital=${town4.isCapital}, Town 5 isCapital=${town5.isCapital}`);

const proj = new Projectile('p_test', 'NUKE', 30, 30, 30, 30, engine.playerId);
proj.explode(engine.world, engine);

console.log(`After weapon: Town 4 isRuined=${town4.isRuined}, isCapital=${town4.isCapital}`);
console.log(`Town 5 isCapital=${town5.isCapital}`);

if (!town4.isRuined) throw new Error('Town 4 should be ruined by nuke!');
if (town4.isCapital) throw new Error('Town 4 should no longer be capital!');
if (!town5.isCapital) throw new Error('Town 5 should be elected new capital of green kingdom!');

console.log('ALL TESTS PASSED SUCCESSFULLY!');
