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

    const handleMsg = (packet) => {
      this.listeners.forEach(fn => fn(packet));
    };

    switch (type) {
      case CONFIG.SOCKET_TYPES.BROADCAST:
        this.activeSocket = new BroadcastSocketAdapter(roomCode, handleMsg);
        break;
      case CONFIG.SOCKET_TYPES.WEBRTC:
        this.activeSocket = new WebRTCSocketAdapter(roomCode, isHost, handleMsg, serverUrl);
        break;
      case CONFIG.SOCKET_TYPES.WEBSOCKET:
        this.activeSocket = new WebSocketAdapter(serverUrl, roomCode, handleMsg);
        break;
      case CONFIG.SOCKET_TYPES.POLLING:
        this.activeSocket = new PollingSocketAdapter(serverUrl, roomCode, handleMsg);
        break;
      case CONFIG.SOCKET_TYPES.WEBTRANSPORT:
        this.activeSocket = new BroadcastSocketAdapter(roomCode, handleMsg);
        break;
      default:
        this.activeSocket = new BroadcastSocketAdapter(roomCode, handleMsg);
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
