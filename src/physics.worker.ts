import { initializePhysics } from './physics';
import { createSimulation } from './extended-physics';
import { gameId } from './games';
let simulation: ReturnType<typeof createSimulation> | undefined;
const ready = initializePhysics();
self.onmessage = async ({ data }) => {
  try {
    await ready;
    if (data.type === 'init') { simulation?.free(); simulation = createSimulation(data.seed >>> 0,gameId(data.game)); }
    else if (data.type === 'start') simulation?.start();
    else if (data.type === 'step') for (let i = 0; i < Math.min(data.steps, 24); i++) simulation?.step();
    self.postMessage({ type: 'snapshot', id: data.id, snapshot: simulation?.snapshot() });
  } catch (error) { self.postMessage({ type: 'error', id: data.id, error: String(error) }); }
};
