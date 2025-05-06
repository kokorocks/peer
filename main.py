import asyncio, json, base64, zlib, websockets
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer, MediaRecorder

DEFAULT_URLS = [
    "wss://quick-ferret-74.deno.dev/ws"
]

class WebRTCClient:
    def __init__(self, id, target, urls=None, use_av=True):
        self.id = id
        self.target = target
        self.urls = urls or DEFAULT_URLS
        self.use_av = use_av
        self.ws = None
        self.pc = RTCPeerConnection()
        self.channel = None
        self.player = None
        self.recorder = None

    def add_url(self, url):
        self.urls.append(url)

    def set_urls(self, urls):
        self.urls = urls

    async def connect(self):
        for url in self.urls:
            try:
                self.ws = await websockets.connect(url)
                await self.ws.send(json.dumps({"action": "register", "id": self.id}))
                print(f"[OK] Connected to {url}")
                break
            except Exception as e:
                print(f"[WARN] Failed to connect to {url}: {e}")
        else:
            raise Exception("No signaling servers available")

        if self.use_av:
            await self.setup_media()

        asyncio.create_task(self._listen())

    async def setup_media(self):
        self.player = MediaPlayer("default", format="pulse")
        if self.player.audio:
            self.pc.addTrack(self.player.audio)
        if self.player.video:
            self.pc.addTrack(self.player.video)
        self.recorder = MediaRecorder("output.mp4")
        await self.recorder.start()

        @self.pc.on("track")
        async def on_track(track):
            await self.recorder.addTrack(track)

        self.channel = self.pc.createDataChannel("chat")

        @self.channel.on("message")
        def on_message(msg):
            print("[DATA]", msg)

    async def call(self):
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)
        await self.send_sdp(self.target, self.pc.localDescription)

    async def send_sdp(self, to, desc):
        compressed = base64.b64encode(zlib.compress(json.dumps({
            "sdp": desc.sdp,
            "type": desc.type
        }).encode())).decode()

        await self.ws.send(json.dumps({
            "action": "send",
            "from": self.id,
            "target": to,
            "data": compressed
        }))

    async def _listen(self):
        async for msg in self.ws:
            m = json.loads(msg)
            if m["action"] != "receive":
                continue
            decoded = json.loads(zlib.decompress(base64.b64decode(m["data"])).decode())
            sdp = RTCSessionDescription(decoded["sdp"], decoded["type"])
            if sdp.type == "offer":
                await self.pc.setRemoteDescription(sdp)
                answer = await self.pc.createAnswer()
                await self.pc.setLocalDescription(answer)
                await self.send_sdp(m["from"], self.pc.localDescription)
            elif sdp.type == "answer":
                await self.pc.setRemoteDescription(sdp)

    def send_message(self, msg):
        if self.channel:
            self.channel.send(msg)

    async def close(self):
        if self.recorder: await self.recorder.stop()
        await self.pc.close()
        if self.ws: await self.ws.close()
