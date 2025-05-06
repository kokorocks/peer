const DEFAULT_URLS = [
  "wss://quick-ferret-74.deno.dev"
];

export class WebRTCClient {
  constructor(id, onMessage, urls) {
    this.id = id;
    this.urls = urls || [...DEFAULT_URLS];
    this.onMessage = onMessage;
    this.peer = new RTCPeerConnection();
    this.channel = this.peer.createDataChannel("chat");
    this.socket = null;

    this.channel.onmessage = e => onMessage?.(e.data);
    this.init();
  }

  addUrl(url) {
    this.urls.push(url);
  }

  setUrls(urls) {
    this.urls = urls;
  }

  async init() {
    for (const url of this.urls) {
      try {
        this.socket = new WebSocket(`${url}/ws`);
        this.socket.onopen = () => {
          console.log("[OK] Connected:", url);
          this.socket.send(JSON.stringify({ action: "register", id: this.id }));
        };
        this.socket.onmessage = async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.action === "receive") {
            const sdp = JSON.parse(await this.decompress(msg.data));
            await this.handleRemote(sdp, msg.from);
          }
        };
        break;
      } catch (err) {
        console.warn("[WARN] Failed:", url, err);
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach(t => this.peer.addTrack(t, stream));
    const local = document.querySelector("#local");
    if (local) local.srcObject = stream;

    this.peer.ontrack = ({ streams }) => {
      const remote = document.querySelector("#remote");
      if (remote) remote.srcObject = streams[0];
    };
  }

  async call(target) {
    this.target = target;
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    const compressed = await this.compress(JSON.stringify(offer));
    this.send(target, compressed);
  }

  async handleRemote(sdp, from) {
    const desc = new RTCSessionDescription(sdp);
    if (desc.type === "offer") {
      await this.peer.setRemoteDescription(desc);
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      const compressed = await this.compress(JSON.stringify(answer));
      this.send(from, compressed);
    } else if (desc.type === "answer") {
      await this.peer.setRemoteDescription(desc);
    }
  }

  sendMessage(msg) {
    if (this.channel) this.channel.send(msg);
  }

  send(target, data) {
    this.socket.send(JSON.stringify({
      action: "send",
      from: this.id,
      target,
      data
    }));
  }

  async compress(str) {
    const cs = new CompressionStream("deflate");
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(str));
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  async decompress(base64) {
    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    writer.write(binary);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(buf);
  }
}

