const fs = require('fs');
const path = require('path');

global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ getContext: () => null })
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
global.URL = {
  createObjectURL: () => '',
  revokeObjectURL: () => {}
};
global.Blob = function() {};

const CONFIG = require('./js/config.js');
const WorldMap = require('./js/world.js');
const { Town, Building } = require('./js/towns.js');
const Unit = require('./js/units.js');
const Game = require('./js/game.js');

console.log('Testing Siege & Conquest Mechanism...');

const game = new Game();
game.world = new WorldMap(64, 64, 12345);
game.spatialGrid = null;

const town1 = game.spawnKingdom('HUMAN', 'Human Kingdom', 10, 10, 'human_k');
const town2 = game.spawnKingdom('ORC', 'Orc Kingdom', 40, 40, 'orc_k');

console.log('Town 1 kingdom:', town1.kingdomKey);
console.log('Town 2 kingdom:', town2.kingdomKey);

game.initiateWar('orc_k', 'human_k');
console.log('War initiated. isAtWar:', game.isAtWar('orc_k', 'human_k'));
if (!game.isAtWar('orc_k', 'human_k')) {
  console.error('FAIL: isAtWar returned false');
  process.exit(1);
}

const orcInvader = game.spawnUnit('WORKER', 'ORC', 10, 10, game.playerId, 'orc_k', town2.id, 21, 'ARMY_MAN');

town1.update(game);
console.log('Initial siege timer after update:', town1.siegeTimer, '/', town1.siegeDuration);

if (town1.siegeTimer !== 1) {
  console.error('FAIL: siegeTimer did not start at 1');
  process.exit(1);
}

if (town1.siegeDuration < 200 || town1.siegeDuration > 600) {
  console.error('FAIL: siegeDuration out of bounds (200-600):', town1.siegeDuration);
  process.exit(1);
}

if (town1.siegeAttackerKingdom !== 'orc_k') {
  console.error('FAIL: siegeAttackerKingdom incorrect:', town1.siegeAttackerKingdom);
  process.exit(1);
}

orcInvader.updateArmyManAI(game.world, game);
if (orcInvader.siegeTargetTownId !== town1.id || orcInvader.state !== 'BESIEGING') {
  console.error('FAIL: Unit siege state not set properly');
  process.exit(1);
}

const targetDuration = town1.siegeDuration;
for (let tick = 2; tick <= targetDuration; tick++) {
  town1.update(game);
  orcInvader.updateArmyManAI(game.world, game);
}

console.log('After siege completion - Town 1 kingdom:', town1.kingdomKey);
if (town1.kingdomKey !== 'orc_k') {
  console.error('FAIL: Town kingdom not converted to conqueror');
  process.exit(1);
}

const humanResident = game.units.find(u => u.townId === town1.id);
console.log('Town 1 resident kingdom:', humanResident ? humanResident.kingdomKey : 'none');
if (humanResident && humanResident.kingdomKey !== 'orc_k') {
  console.error('FAIL: Resident kingdom not converted to conqueror');
  process.exit(1);
}

console.log('SUCCESS: All siege tests passed!');
