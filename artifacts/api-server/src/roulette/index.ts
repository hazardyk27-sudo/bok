import type { Server } from "node:http";
import router from "./routes";
import { rouletteRepository } from "./repository";
import { attachRouletteWebSocket } from "./realtime";

export { router };

export function attachRuntime(server: Server) {
  attachRouletteWebSocket(server);
}

export async function startRuntime() {
  await rouletteRepository.start();
  return rouletteRepository.leadership;
}

export async function stopRuntime() {
  await rouletteRepository.stop();
}
