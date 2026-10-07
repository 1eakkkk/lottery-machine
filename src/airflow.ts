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

/** Venus-specific strong upward core and downward peripheral return. All
 * identities share this field; the ten-second motor ramp is applied separately. */
export function venusAirVelocity(x:number,y:number,z:number,seconds:number,phase:number,intakeOpen=true){
  const height=Math.max(0,Math.min(1,(y+.76)/1.84));
  // The upper throat carries the jet; outside that throat air returns downwards
  // instead of pinning every ball against the ceiling around the feed tube.
  const turn=Math.max(0,Math.min(1,(y-.35)/.35)),blend=turn*turn*(3-2*turn);
  const width=(.075+.085*height)*(1-blend)+.018*blend;
  const jet=Math.exp(-(x*x+z*z)/width);
  // Deflect the upper plume outward rather than funneling the whole cloud
  // toward the intake. Only the narrow axial core can reach the throat.
  const circulation=3.2*(y+.15)*(1-blend)+6*blend,swirl=1.2*(1-blend);
  const throat=Math.max(0,Math.min(1,(y-.80)/.10));
  // A closed intake cannot sustain a through-flow in its narrow feed tube.
  // Approximate diversion below it so bodies drain rather than queue there.
  const up=(14-throat)*(intakeOpen?1:1-.9*blend);
  const gust=1.2*(1-blend)+.25*blend;
  return {x:circulation*x-swirl*z+gust*Math.sin(z*7+seconds*3.7+phase),
    y:up*jet-5*(1-jet)+.45*Math.sin(x*6-z*5+seconds*4.1+phase),
    z:circulation*z+swirl*x+gust*Math.sin(x*8-seconds*3.3+phase)};
}

/** Continuous, smoothly varying blower. These are empirical fluctuations,
 * not a measured motor waveform; no global on/off or fixed plateau cycle. */
export function venusCycleGain(seconds:number){
  return .86+.09*Math.sin(seconds*2.3)+.05*Math.sin(seconds*5.7+.6);
}
