const fs = require('fs');
const vm = require('vm');

const configCode = fs.readFileSync('./js/config.js', 'utf8');
const perlinCode = fs.readFileSync('./js/perlin.js', 'utf8');
const townsCode = fs.readFileSync('./js/towns.js', 'utf8');
const unitsCode = fs.readFileSync('./js/units.js', 'utf8');
const worldCode = fs.readFileSync('./js/world.js', 'utf8');
const gameCode = fs.readFileSync('./js/game.js', 'utf8');

const dummyCanvas = {
  getContext: () => null,
  width: 800,
  height: 600,
  addEventListener: () => {}
};

const sandbox = {
  console: console,
  Math: Math,
  Set: Set,
  Map: Map,
  Array: Array,
  Uint8Array: Uint8Array,
  Float32Array: Float32Array,
  document: {
    getElementById: () => dummyCanvas,
    querySelectorAll: () => []
  },
  window: {
    addEventListener: () => {},
    innerWidth: 800,
    innerHeight: 600
  },
  WebGL2DRenderer: class {
    init() {}
    render() {}
  },
  MultiSocketManager: class {
    init() {}
    sendAction() {}
  }
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(configCode, sandbox);
vm.runInContext(perlinCode, sandbox);
vm.runInContext(townsCode, sandbox);
vm.runInContext(unitsCode, sandbox);
vm.runInContext(worldCode, sandbox);
vm.runInContext(gameCode + '; window.GameEngine = GameEngine;', sandbox);

console.log('Testing City Abandonment...');

const game = new sandbox.window.GameEngine('gameCanvas');
game.initWorld(256, 256, 12345);

const town = game.spawnKingdom('HUMAN', 'Test Kingdom', 50, 50);
console.log('Town created:', town.id, 'isRuined:', town.isRuined);
console.log('Population before kill:', game.getTownUnitsCount(town.id));

game.units.forEach(u => { u.hp = 0; });
game.units = game.units.filter(u => u.hp > 0);

console.log('Population after kill:', game.getTownUnitsCount(town.id));

town.update(game.world, game);

console.log('Town isRuined after update:', town.isRuined);

if (town.isRuined) {
  console.log('TEST PASSED: City correctly marked as ruined when population hits 0.');
} else {
  console.log('TEST FAILED: City was NOT marked as ruined!');
}
