class MultiSocketManager {
  constructor() {
    this.activeSocket = null;
    this.currentType = CONFIG.SOCKET_TYPES.BROADCAST;
    this.roomCode = 'LAN_ROOM_1';
    this.isHost = true;
    this.listeners = [];
  }

  init(type, roomCode, isHost = true, serverUrl = '') {
    if (this.activeSocket) {
      this.activeSocket.close();
      this.activeSocket = null;
    }

    this.currentType = type;
    this.roomCode = roomCode;
    this.isHost = isHost;

    const loc = window.location;
    const resolvedUrl = serverUrl || (loc.origin && loc.origin.startsWith('http') ? loc.origin : `http://${loc.hostname || 'localhost'}:${loc.port || 8080}`);

    const handleMsg = (packet) => {
      if (packet && packet.type === 'ROLE_ASSIGNMENT') {
        this.isHost = packet.isHost;
      }
      this.listeners.forEach(fn => fn(packet));
    };

    switch (type) {
      case CONFIG.SOCKET_TYPES.BROADCAST:
        this.activeSocket = new BroadcastSocketAdapter(roomCode, handleMsg, isHost);
        break;
      case CONFIG.SOCKET_TYPES.WEBRTC:
        this.activeSocket = new WebRTCSocketAdapter(roomCode, isHost, handleMsg, resolvedUrl);
        break;
      case CONFIG.SOCKET_TYPES.WEBSOCKET:
        this.activeSocket = new WebSocketAdapter(resolvedUrl, roomCode, handleMsg, isHost);
        break;
      case CONFIG.SOCKET_TYPES.POLLING:
        this.activeSocket = new PollingSocketAdapter(resolvedUrl, roomCode, handleMsg, isHost);
        break;
      case CONFIG.SOCKET_TYPES.WEBTRANSPORT:
        this.activeSocket = new WebSocketAdapter(resolvedUrl, roomCode, handleMsg, isHost);
        break;
      default:
        this.activeSocket = new BroadcastSocketAdapter(roomCode, handleMsg, isHost);
        break;
    }
  }

  onMessage(callback) {
    this.listeners.push(callback);
  }

  send(packet) {
    if (this.activeSocket) {
      this.activeSocket.send(packet);
    }
  }
}
