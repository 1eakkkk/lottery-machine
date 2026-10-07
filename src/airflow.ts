/** Empirical circulation field in chamber-local coordinates, shared by all
 * ball identities. It approximates a blower, not a full fluid dynamics solver. */
export function airVelocity(x:number,y:number,z:number,seconds:number,phase:number) {
  // A spreading upward jet, outward flow in the upper chamber, and inward
  // return flow near the floor. All balls see the same continuous field.
  const height=Math.max(0,Math.min(1,(y+.76)/1.84));
  // Keep the floor jet concentrated at the diffuser so the offset gravity
  // outlet is in the return flow; spread it across the chamber higher up.
  const jet=Math.exp(-(x*x+z*z)/(.18+.42*height));
  // Turn the central jet into lateral return flow before it reaches the lid.
  const turn=Math.max(0,Math.min(1,(y-.20)/.65));
  const rolloff=1-.45*turn*turn*(3-2*turn);
  const circulation=4.9*(y+.20),swirl=1.8;
  return {
    x:circulation*x-swirl*z+.8*Math.sin(z*7+seconds*3.7+phase),
    y:8.8*jet*rolloff-1.5+.65*Math.sin(x*6-z*5+seconds*4.1+phase),
    z:circulation*z+swirl*x+.8*Math.sin(x*8-seconds*3.3+phase),
  };
}
