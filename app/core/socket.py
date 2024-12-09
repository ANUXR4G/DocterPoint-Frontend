from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        self.rooms[room_id].append(websocket)
        print(room_id)
        print(f"patient #{room_id} connected to monitoring room!")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].remove(websocket)
            if not self.rooms[room_id]:  # delete the room if it's empty
                del self.rooms[room_id]
        print(f"patient #{room_id} left the monitoring room!")

    # async def send_personal_message(self, message: str, websocket: WebSocket):
    #     await websocket.send_text(message)

    async def broadcast_to_room(self, room_id: str, message: str):
        if room_id in self.rooms:
            for connection in self.rooms[room_id]:
                await connection.send_text(message)


socket_manager = WebSocketManager()
