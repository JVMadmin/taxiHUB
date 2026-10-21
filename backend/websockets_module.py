"""
WebSockets autenticados por token en query string: terminal (por sitio),
operador, pasajero y dueño. Cada canal valida scope y, si aplica, que el
`sub` del token corresponda al canal. El ConnectionManager sigue en
server.py (lo usan todos los módulos). Mismo patrón factory que los demás
módulos.
"""
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query


def build_router(*, DEFAULT_SITIO, JWT_ALGORITHM, JWT_SECRET, manager):
    router = APIRouter(prefix="/api", tags=["websockets"])

    def _ws_payload_valido(token: Optional[str], scope: str, subject_id: Optional[str] = None) -> bool:
        """Valida el JWT del WebSocket: scope correcto y, si aplica, que el `sub`
        corresponda al canal (operador/pasajero solo pueden abrir su propio canal)."""
        if not token:
            return False
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            return False
        except jwt.InvalidTokenError:
            return False
        # Validación exp adicional (si el token trae exp, debe ser futuro)
        exp = payload.get("exp")
        if exp is not None:
            try:
                if isinstance(exp, (int, float)):
                    exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)
                elif isinstance(exp, datetime):
                    exp_dt = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
                else:
                    exp_dt = datetime.fromisoformat(str(exp))
                    if exp_dt.tzinfo is None:
                        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) > exp_dt:
                    return False
            except Exception:
                pass
        actual = payload.get("scope")
        if actual != scope:
            # Compat: los tokens de operador antiguos no traían scope.
            if not (scope == "operador" and actual is None):
                return False
        if subject_id is not None and payload.get("sub") != subject_id:
            return False
        return True

    async def ws_autenticar(ws: WebSocket, token: Optional[str], scope: str, subject_id: Optional[str] = None) -> bool:
        """Acepta la conexión y, si el token no es válido, la cierra (1008)."""
        await ws.accept()
        if not _ws_payload_valido(token, scope, subject_id):
            await ws.close(code=1008, reason="No autorizado")
            return False
        return True

    @router.websocket("/ws/terminal")
    async def ws_terminal(ws: WebSocket, token: Optional[str] = Query(None)):
        if not await ws_autenticar(ws, token, "terminal"):
            return
        sitio_ws = DEFAULT_SITIO
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            sitio_ws = payload.get("sitio_id") or payload.get("tenant_id") or DEFAULT_SITIO
        except Exception:
            pass
        await manager.connect_terminal(ws, sitio_id=sitio_ws)
        try:
            while True:
                await ws.receive_text()  # keepalive
        except WebSocketDisconnect:
            manager.disconnect_terminal(ws)

    @router.websocket("/ws/operador/{operador_id}")
    async def ws_operador(ws: WebSocket, operador_id: str, token: Optional[str] = Query(None)):
        if not await ws_autenticar(ws, token, "operador", subject_id=operador_id):
            return
        await manager.connect_operador(operador_id, ws)
        try:
            while True:
                # Latido de la app del chofer: en redes móviles una conexión callada se corta
                # sin aviso y las ofertas dejaban de llegar. "ping" → "pong" la mantiene viva
                # y le deja a la app detectar una conexión muerta.
                if await ws.receive_text() == "ping":
                    await ws.send_text('{"type": "pong"}')
        except WebSocketDisconnect:
            manager.disconnect_operador(operador_id, ws)

    @router.websocket("/ws/pasajero/{pasajero_id}")
    async def ws_pasajero(ws: WebSocket, pasajero_id: str, token: Optional[str] = Query(None)):
        if not await ws_autenticar(ws, token, "pasajero", subject_id=pasajero_id):
            return
        await manager.connect_pasajero(pasajero_id, ws)
        try:
            while True:
                await ws.receive_text()  # keepalive
        except WebSocketDisconnect:
            manager.disconnect_pasajero(pasajero_id, ws)

    @router.websocket("/ws/dueno/{dueno_id}")
    async def ws_dueno(ws: WebSocket, dueno_id: str, token: Optional[str] = Query(None)):
        if not await ws_autenticar(ws, token, "dueno", subject_id=dueno_id):
            return
        await manager.connect_dueno(dueno_id, ws)
        try:
            while True:
                await ws.receive_text()  # keepalive
        except WebSocketDisconnect:
            manager.disconnect_dueno(dueno_id, ws)

    return router
