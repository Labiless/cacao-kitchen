import { defineRoom, defineServer } from "colyseus";
import { ROOM_NAME, SERVER_PORT } from "@cacao/shared";
import { KitchenRoom } from "./rooms/KitchenRoom.ts";

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(KitchenRoom),
  },
});

const port = Number(process.env.PORT ?? SERVER_PORT);
await server.listen(port);
console.log(`Colyseus server listening on ws://localhost:${port}`);
