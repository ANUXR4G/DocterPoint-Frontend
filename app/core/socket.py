from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
import json


class WebSocketManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}
        self.admin_connections: list[WebSocket] = []
        self.online: list[str] = []

    # Connect a User from a specific room
    async def connect(self, websocket: WebSocket, user_id: str | None = None):
        await websocket.accept()
        if user_id:
            if user_id not in self.rooms:
                self.rooms[user_id] = []
            self.rooms[user_id].append(websocket)
            self.online.append(user_id)
        else:
            self.admin_connections.append(websocket)

        print(f"User #{user_id} connected to room.")

    # Diconnect a User from a specific room
    def disconnect(self, websocket: WebSocket, user_id: str | None = None):
        if user_id:
            if user_id in self.rooms:
                self.rooms[user_id].remove(websocket)
                if not self.rooms[user_id]:
                    # Delete dict key of the user
                    del self.rooms[user_id]
                # Remove the user id from the online list
                self.online.remove(user_id)
        else:
            self.admin_connections.remove(websocket)

        print(f"User #{user_id} left the room.")

    # Broadcast text to a specific room
    async def broadcast_to_room(self, room_id: str, message: str):
        if room_id in self.rooms:
            for connection in self.rooms[room_id]:
                await connection.send_text(message)

    # Broadcast JSON data to a specific room
    async def send_private_msg(self, room_id: str, msg: dict):
        if room_id in self.rooms:
            for ws in self.rooms[room_id]:
                await ws.send_json(jsonable_encoder(msg))

    # Broadcast JSON data to the Admins.
    async def broadcast_to_admins(self, msg: dict):
        for admin_ws in self.admin_connections:
            await admin_ws.send_json(jsonable_encoder(msg))

    #     self.online_users: set[str] = set()
    #     self.admin_connections: list[WebSocket] = []

    # async def connect(self, ws: WebSocket, user_id: str = None):
    #     await ws.accept()
    #     if user_id:
    #         if user_id not in self.rooms:
    #             self.rooms[user_id] = []
    #         self.rooms[user_id].append(ws)
    #         self.online_users.add(user_id)
    #         await self.broadcast_online_users()
    #         print(f"User #{user_id} connected.")
    #     else:
    #         self.admin_connections.append(ws)
    #         print("Admin connected.")

    # async def disconnect(self, ws: WebSocket, user_id: str = None):
    #     if user_id:
    #         if user_id in self.rooms:
    #             self.rooms[user_id].remove(ws)
    #             if not self.rooms[user_id]:
    #                 del self.rooms[user_id]
    #             self.online_users.discard(user_id)
    #             await self.broadcast_online_users()
    #         print(f"User #{user_id} disconnected.")
    #     else:
    #         self.admin_connections.remove(ws)
    #         print("Admin disconnected.")

    # async def broadcast_to_room(self, user_id: str, msg: str):
    #     if user_id in self.rooms:
    #         for connection in self.rooms[user_id]:
    #             await connection.send_text(msg)

    # async def broadcast_to_admin(self, data: dict):
    #     for connection in self.admin_connections:
    #         await connection.send_text(json.dumps(data))

    # async def broadcast_online_users(self):
    #     online_users_list = list(self.online_users)
    #     msg = json.dumps({"type": "online_users", "users": online_users_list})
    #     for connection in self.admin_connections:
    #         await connection.send_text(msg)

    # async def connect(self, websocket: WebSocket, room_id: str):
    #     await websocket.accept()
    #     if room_id not in self.rooms:
    #         self.rooms[room_id] = []
    #     self.rooms[room_id].append(websocket)
    #     # self.online_users.add(room_id)
    #     # await self.broadcast_online_users()
    #     print(f"user #{room_id} connected to monitoring room.")

    # async def disconnect(self, websocket: WebSocket, room_id: str):
    #     if room_id in self.rooms:
    #         self.rooms[room_id].remove(websocket)
    #         if not self.rooms[room_id]:  # delete the room if it's empty
    #             del self.rooms[room_id]
    #         # self.online_users.discard(room_id)
    #         # await self.broadcast_online_users()
    #     print(f"user #{room_id} left the monitoring room.")

    # async def send_personal_message(self, message: str, websocket: WebSocket):
    #     await websocket.send_text(message)

    # async def broadcast_to_room(self, room_id: str, message: str):
    #     if room_id in self.rooms:
    #         for connection in self.rooms[room_id]:
    #             await connection.send_text(message)


socket_manager = WebSocketManager()
