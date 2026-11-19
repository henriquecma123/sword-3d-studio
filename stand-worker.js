import { meshStand } from './stand-mesher.js';

self.onmessage = (e) => {
  const r = meshStand(e.data);
  self.postMessage(r, [r.pos.buffer, r.nor.buffer, r.col.buffer, r.ao.buffer, r.idx.buffer]);
};
