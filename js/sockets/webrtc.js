class WebRTCSocketAdapter {
  constructor(roomCode, isHost, onMessageCallback, signalServerUrl = null) {
    this.roomCode = roomCode;
    this.isHost = isHost;
    this.onMessage = onMessageCallback;
    this.connected = false;
    this.peerId = `peer_${Math.floor(Math.random() * 899999 + 100000)}`;

    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const signalUrl = signalServerUrl ? signalServerUrl.replace(/^http/, 'ws') : (loc.hostname ? `${wsProto}//${loc.hostname}:${loc.port || 8080}` : 'ws://localhost:8080');

    this.peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.pendingIceCandidates = [];
    this.dataChannel = null;
    this.signalingAdapter = new WebSocketAdapter(signalUrl, roomCode, (msg) => this.handleSignal(msg), isHost);
    this.broadcastFallback = new BroadcastSocketAdapter(roomCode, (msg) => this.handleSignal(msg), isHost);

    this.peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'RTC_ICE',
          roomCode: this.roomCode,
          senderPeerId: this.peerId,
          candidate: event.candidate
        });
      }
    };

    if (this.isHost) {
      this.dataChannel = this.peer.createDataChannel('gameData');
      this.setupChannel(this.dataChannel);
      setTimeout(() => this.createAndSendOffer(), 300);
    } else {
      this.peer.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupChannel(this.dataChannel);
      };
      setTimeout(() => {
        this.sendSignal({
          type: 'REQUEST_RTC_OFFER',
          roomCode: this.roomCode,
          senderPeerId: this.peerId
        });
      }, 500);
    }

    setTimeout(() => {
      this.sendSignal({
        type: 'WHO_IS_HOST',
        roomCode: this.roomCode,
        senderPeerId: this.peerId
      });
    }, 200);
  }

  sendSignal(msg) {
    if (this.signalingAdapter && this.signalingAdapter.connected) {
      this.signalingAdapter.send(msg);
    }
    if (this.broadcastFallback) {
      this.broadcastFallback.send(msg);
    }
  }

  async flushPendingCandidates() {
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      try {
        await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {}
    }
  }

  async createAndSendOffer() {
    try {
      if (this.peer.signalingState !== 'stable' && this.peer.signalingState !== 'have-local-offer') return;
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      this.sendSignal({
        type: 'RTC_OFFER',
        roomCode: this.roomCode,
        senderPeerId: this.peerId,
        offer: offer
      });
    } catch (e) {}
  }

  async handleSignal(data) {
    if (!data || data.senderPeerId === this.peerId) return;

    if (data.type === 'WHO_IS_HOST' && data.roomCode === this.roomCode) {
      if (this.isHost) {
        this.sendSignal({ type: 'I_AM_HOST', roomCode: this.roomCode, senderPeerId: this.peerId });
      }
    } else if (data.type === 'I_AM_HOST' && data.roomCode === this.roomCode) {
      if (this.isHost) {
        this.isHost = false;
        if (this.onMessage) {
          this.onMessage({ type: 'ROLE_ASSIGNMENT', isHost: false, roomCode: this.roomCode });
        }
      }
    }

    if (data.type === 'REQUEST_RTC_OFFER' && this.isHost) {
      this.createAndSendOffer();
    } else if (data.type === 'RTC_OFFER' && !this.isHost) {
      try {
        await this.peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        await this.flushPendingCandidates();
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        this.sendSignal({
          type: 'RTC_ANSWER',
          roomCode: this.roomCode,
          senderPeerId: this.peerId,
          answer: answer
        });
      } catch (e) {}
    } else if (data.type === 'RTC_ANSWER' && this.isHost) {
      try {
        if (this.peer.signalingState !== 'stable') {
          await this.peer.setRemoteDescription(new RTCSessionDescription(data.answer));
          await this.flushPendingCandidates();
        }
      } catch (e) {}
    } else if (data.type === 'RTC_ICE') {
      try {
        if (data.candidate) {
          if (!this.peer.remoteDescription || !this.peer.remoteDescription.type) {
            this.pendingIceCandidates.push(data.candidate);
          } else {
            await this.peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }
      } catch (e) {}
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
    channel.onerror = () => {
      this.connected = false;
    };
  }

  send(packet) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(packet));
        return;
      } catch (e) {}
    }
    this.sendSignal(packet);
  }

  close() {
    this.connected = false;
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
    }
    if (this.peer) {
      try { this.peer.close(); } catch (e) {}
    }
    if (this.signalingAdapter) {
      this.signalingAdapter.close();
    }
    if (this.broadcastFallback) {
      this.broadcastFallback.close();
    }
  }
}
