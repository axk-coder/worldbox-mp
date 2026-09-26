class DeterministicPRNG {
  constructor(seed = 12345) {
    this.seed = seed >>> 0;
  }
  setSeed(seed) {
    this.seed = seed >>> 0;
  }
  next() {
    let t = (this.seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  random() {
    return this.next();
  }
}

const CONFIG = {
  prng: new DeterministicPRNG(12345),
  WORLD_WIDTH: 256,
  WORLD_HEIGHT: 256,
  TILE_SIZE: 16,
  TICKS_PER_SEC: 20,
  RACES: {
    HUMAN: { id: 'HUMAN', name: 'Humans', hp: 100, speed: 1.7, atk: 12, color: '#3b82f6', kingdomKey: 'blue' },
    ORC: { id: 'ORC', name: 'Orcs', hp: 160, speed: 1.4, atk: 22, color: '#ef4444', kingdomKey: 'red' },
    ELF: { id: 'ELF', name: 'Elves', hp: 90, speed: 2.1, atk: 16, color: '#10b981', kingdomKey: 'green' },
    DWARF: { id: 'DWARF', name: 'Dwarves', hp: 140, speed: 1.3, atk: 18, color: '#eab308', kingdomKey: 'yellow' }
  },
  KINGDOM_COLORS: {
    blue: { primary: '#2563eb', border: 'rgba(37, 99, 235, 0.35)', name: 'Human Realm' },
    red: { primary: '#dc2626', border: 'rgba(220, 38, 38, 0.35)', name: 'Orcish Horde' },
    green: { primary: '#059669', border: 'rgba(5, 150, 105, 0.35)', name: 'Elven Dominion' },
    yellow: { primary: '#d97706', border: 'rgba(217, 119, 6, 0.35)', name: 'Dwarven Hold' }
  },
  KINGDOM_PALETTE: [
    { primary: '#2563eb', border: 'rgba(37, 99, 235, 0.35)' },
    { primary: '#dc2626', border: 'rgba(220, 38, 38, 0.35)' },
    { primary: '#059669', border: 'rgba(5, 150, 105, 0.35)' },
    { primary: '#d97706', border: 'rgba(217, 119, 6, 0.35)' },
    { primary: '#7c3aed', border: 'rgba(124, 58, 237, 0.35)' },
    { primary: '#0891b2', border: 'rgba(8, 145, 178, 0.35)' },
    { primary: '#ea580c', border: 'rgba(234, 88, 12, 0.35)' },
    { primary: '#db2777', border: 'rgba(219, 39, 119, 0.35)' },
    { primary: '#0d9488', border: 'rgba(13, 148, 136, 0.35)' },
    { primary: '#65a30d', border: 'rgba(101, 163, 13, 0.35)' },
    { primary: '#4f46e5', border: 'rgba(79, 70, 229, 0.35)' },
    { primary: '#c026d3', border: 'rgba(192, 38, 211, 0.35)' }
  ],
  registerKingdom(kingdomKey, name, raceKey) {
    if (this.KINGDOM_COLORS[kingdomKey]) {
      if (name) this.KINGDOM_COLORS[kingdomKey].name = name;
      return this.KINGDOM_COLORS[kingdomKey];
    }
    const count = Object.keys(this.KINGDOM_COLORS).length;
    const pal = this.KINGDOM_PALETTE[count % this.KINGDOM_PALETTE.length];
    const info = {
      primary: pal.primary,
      border: pal.border,
      name: name || `Kingdom ${count + 1}`
    };
    this.KINGDOM_COLORS[kingdomKey] = info;
    return info;
  },
  SOCKET_TYPES: {
    BROADCAST: 'BROADCAST_LAN',
    WEBRTC: 'WEBRTC_P2P',
    WEBSOCKET: 'WEBSOCKET_NET',
    WEBTRANSPORT: 'WEBTRANSPORT_QUIC',
    POLLING: 'HTTP_POLLING'
  },
  TILES: {
    DEEP_WATER: 0,
    SHALLOW_WATER: 1,
    SAND: 2,
    GRASS: 3,
    FOREST: 4,
    MOUNTAIN: 5,
    SNOW: 6,
    CRATER: 7,
    FARMLAND: 8
  },
  TILE_COLORS: {
    0: '#0f4c81',
    1: '#29b6f6',
    2: '#f4d03f',
    3: '#2ecc71',
    4: '#1b5e20',
    5: '#78909c',
    6: '#ffffff',
    7: '#263238',
    8: '#8d6e63'
  },
  RESOURCES: {
    WOOD: 'wood',
    STONE: 'stone',
    GOLD: 'gold',
    FOOD: 'food'
  },
  BUILDINGS: {
    TOWN_HALL: { id: 'TOWN_HALL', hp: 600, cost: { wood: 50, stone: 50 }, radius: 6 },
    STOCKPILE: { id: 'STOCKPILE', hp: 350, cost: { wood: 10 }, radius: 3 },
    HOUSE: { id: 'HOUSE', hp: 200, cost: { wood: 20 }, radius: 2 },
    BARRACKS: { id: 'BARRACKS', hp: 400, cost: { wood: 40, stone: 30 }, radius: 3 },
    FARM: { id: 'FARM', hp: 120, cost: { wood: 15 }, radius: 2 },
    DOCK: { id: 'DOCK', hp: 300, cost: { wood: 50, stone: 20 }, radius: 4 },
    TURRET: { id: 'TURRET', hp: 250, cost: { wood: 30, stone: 40 }, radius: 4 }
  },
  UNITS: {
    WORKER: { id: 'WORKER', hp: 60, speed: 1.6, atk: 6, range: 1, isNaval: false, cost: { food: 15 } },
    INFANTRY: { id: 'INFANTRY', hp: 120, speed: 1.8, atk: 18, range: 1, isNaval: false, cost: { food: 20, wood: 5 } },
    ARCHER: { id: 'ARCHER', hp: 85, speed: 1.7, atk: 14, range: 5, isNaval: false, cost: { food: 20, wood: 15 } },
    BOAT_CANNON: { id: 'BOAT_CANNON', hp: 300, speed: 2.4, atk: 40, range: 8, isNaval: true, cost: { wood: 60, gold: 20 } },
    BOAT_TRANSPORT: { id: 'BOAT_TRANSPORT', hp: 250, speed: 2.6, atk: 0, range: 0, isNaval: true, cost: { wood: 40 } }
  },
  WEAPONS: {
    BOMB: { id: 'BOMB', blastRadius: 4, damage: 200, crater: true },
    MISSILE: { id: 'MISSILE', blastRadius: 7, damage: 400, crater: true },
    NUKE: { id: 'NUKE', blastRadius: 14, damage: 1200, crater: true, radioactive: true },
    ACID: { id: 'ACID', blastRadius: 5, damage: 150, crater: false }
  },
  JOBS: {
    CHILD: { id: 'CHILD', name: 'Child', minAge: 0 },
    TREE_CHOPPER: { id: 'TREE_CHOPPER', name: 'Tree Chopper', minAge: 18 },
    MINER: { id: 'MINER', name: 'Miner', minAge: 18 },
    HOUSE_BUILDER: { id: 'HOUSE_BUILDER', name: 'House Builder', minAge: 18 },
    ARMY_MAN: { id: 'ARMY_MAN', name: 'Army Man', minAge: 18 }
  }
};
