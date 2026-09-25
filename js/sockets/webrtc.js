class WebRTCSocketAdapter {
  constructor(roomCode, isHost, onMessageCallback, signalServerUrl = null) {
    this.roomCode = roomCode;
    this.isHost = isHost;
    this.onMessage = onMessageCallback;
    this.peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    this.dataChannel = null;
    this.connected = false;

    if (this.isHost) {
      this.dataChannel = this.peer.createDataChannel('gameData');
      this.setupChannel(this.dataChannel);
    } else {
      this.peer.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupChannel(this.dataChannel);
      };
    }
  }

  setupChannel(channel) {
    channel.onopen = () => {
      this.connected = true;
    };
    channel.onmessage = (event) => {
      if (this.onMessage) {
        try {
          const data = JSON.parse(event.data);
          this.onMessage(data);
        } catch (e) {}
      }
    };
    channel.onclose = () => {
      this.connected = false;
    };
  }

  send(packet) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(packet));
    }
  }

  close() {
    this.connected = false;
    if (this.peer) {
      this.peer.close();
    }
  }
}
