const CONFIG = {
  WORLD_WIDTH: 160,
  WORLD_HEIGHT: 160,
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
  }
};
