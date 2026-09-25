const CONFIG = {
  WORLD_WIDTH: 160,
  WORLD_HEIGHT: 160,
  TILE_SIZE: 16,
  TICKS_PER_SEC: 20,
  KINGDOM_COLORS: {
    blue: { primary: '#2979ff', border: 'rgba(41, 121, 255, 0.35)', name: 'Blue Realm' },
    red: { primary: '#ff1744', border: 'rgba(255, 23, 68, 0.35)', name: 'Red Empire' },
    green: { primary: '#00e676', border: 'rgba(0, 230, 118, 0.35)', name: 'Green Dominion' },
    yellow: { primary: '#ffea00', border: 'rgba(255, 234, 0, 0.35)', name: 'Golden Horde' },
    purple: { primary: '#d500f9', border: 'rgba(213, 0, 249, 0.35)', name: 'Purple Dynasty' }
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
  TILE_NAMES: {
    0: 'Deep Ocean',
    1: 'Shallow Waters',
    2: 'Coastal Sand',
    3: 'Grass Plains',
    4: 'Dense Forest',
    5: 'High Mountains',
    6: 'Snowy Peak',
    7: 'Scorched Crater',
    8: 'Farmland'
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
    BOAT_TRANSPORT: { id: 'BOAT_TRANSPORT', hp: 250, speed: 2.6, atk: 0, range: 0, isNaval: true, cost: { wood: 40 } },
    TANK: { id: 'TANK', hp: 450, speed: 1.3, atk: 55, range: 4, isNaval: false, cost: { stone: 50, gold: 30 } }
  },
  WEAPONS: {
    BOMB: { id: 'BOMB', blastRadius: 4, damage: 200, crater: true },
    MISSILE: { id: 'MISSILE', blastRadius: 7, damage: 400, crater: true },
    NUKE: { id: 'NUKE', blastRadius: 14, damage: 1200, crater: true, radioactive: true }
  }
};
