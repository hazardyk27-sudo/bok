import {
  startRouletteGlobalTableScheduler,
} from "./globalTableScheduler";

if (process.env.NODE_ENV !== "test") {
  startRouletteGlobalTableScheduler();
}

export { default as router } from "./routes";
