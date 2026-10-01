import { DrawSimulation, initializePhysics } from './physics';
let simulation: DrawSimulation | undefined;
const ready = initializePhysics();
self.onmessage = async ({ data }) => {
  try {
    await ready;
    if (data.type === 'init') { simulation?.free(); simulation = new DrawSimulation(data.seed >>> 0); }
    else if (data.type === 'start') simulation?.start();
    else if (data.type === 'step') for (let i = 0; i < Math.min(data.steps, 12); i++) simulation?.step();
    self.postMessage({ type: 'snapshot', id: data.id, snapshot: simulation?.snapshot() });
  } catch (error) { self.postMessage({ type: 'error', id: data.id, error: String(error) }); }
};
