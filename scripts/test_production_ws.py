import asyncio
import websockets
import json
import urllib.request
import ssl

BASE_URL = "https://taxihub.cloud"
WS_URL = "wss://taxihub.cloud/api/ws"
ctx = ssl.create_default_context()

async def test_ws():
    # Obtener token de terminal
    payload = json.dumps({"usuario": "central", "contrasena": "central123"}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/terminal/login", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=ctx) as r:
        term_auth = json.loads(r.read().decode("utf-8"))
        token = term_auth["token"]

    print(f"Token obtenido: {token[:20]}...")
    target_ws = f"{WS_URL}/terminal?token={token}"
    print(f"Conectando a {target_ws}...")
    
    async with websockets.connect(target_ws, ssl=ctx) as ws:
        print("  -> Conexión WebSocket WSS establecida exitosamente!")
        # Enviar ping o esperar mensaje inicial
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
            print(f"  -> Mensaje recibido del servidor WebSocket: {msg[:100]}...")
        except asyncio.TimeoutError:
            print("  -> WebSocket conectado y en espera (heartbeat normal)")

if __name__ == "__main__":
    asyncio.run(test_ws())
