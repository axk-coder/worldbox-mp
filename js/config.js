const CONFIG = {
  WORLD_WIDTH: 128,
  WORLD_HEIGHT: 128,
  TILE_SIZE: 16,
  TICKS_PER_SEC: 20,
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
    0: '#0f172a',
    1: '#1e293b',
    2: '#475569',
    3: '#334155',
    4: '#1e293b',
    5: '#64748b',
    6: '#94a3b8',
    7: '#090d16',
    8: '#3b4252'
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
    TOWN_HALL: { id: 'TOWN_HALL', hp: 500, cost: { wood: 50, stone: 50 }, radius: 6 },
    HOUSE: { id: 'HOUSE', hp: 150, cost: { wood: 20 }, radius: 2 },
    BARRACKS: { id: 'BARRACKS', hp: 300, cost: { wood: 40, stone: 30 }, radius: 3 },
    FARM: { id: 'FARM', hp: 100, cost: { wood: 15 }, radius: 2 },
    DOCK: { id: 'DOCK', hp: 250, cost: { wood: 50, stone: 20 }, radius: 4 },
    TURRET: { id: 'TURRET', hp: 200, cost: { wood: 30, stone: 40 }, radius: 4 }
  },
  UNITS: {
    WORKER: { id: 'WORKER', hp: 50, speed: 1.5, atk: 5, range: 1, isNaval: false, cost: { food: 15 } },
    INFANTRY: { id: 'INFANTRY', hp: 100, speed: 1.8, atk: 15, range: 1, isNaval: false, cost: { food: 20, wood: 5 } },
    ARCHER: { id: 'ARCHER', hp: 70, speed: 1.6, atk: 12, range: 5, isNaval: false, cost: { food: 20, wood: 15 } },
    BOAT_CANNON: { id: 'BOAT_CANNON', hp: 250, speed: 2.2, atk: 35, range: 8, isNaval: true, cost: { wood: 60, gold: 20 } },
    BOAT_TRANSPORT: { id: 'BOAT_TRANSPORT', hp: 200, speed: 2.5, atk: 0, range: 0, isNaval: true, cost: { wood: 40 } },
    TANK: { id: 'TANK', hp: 350, speed: 1.2, atk: 45, range: 4, isNaval: false, cost: { iron: 50, gold: 30 } }
  },
  WEAPONS: {
    BOMB: { id: 'BOMB', blastRadius: 3, damage: 150, crater: true },
    MISSILE: { id: 'MISSILE', blastRadius: 5, damage: 300, crater: true },
    NUKE: { id: 'NUKE', blastRadius: 12, damage: 1000, crater: true, radioactive: true }
  }
};
