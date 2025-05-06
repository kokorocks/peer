# example_text_only.py
from main import peer
import asyncio

async def main():
    client = peer("me", "you")
    await client.connect()
    await asyncio.sleep(1)
    await client.call()
    while True:
        client.send_message("text message")
        await asyncio.sleep(5)

asyncio.run(main())
