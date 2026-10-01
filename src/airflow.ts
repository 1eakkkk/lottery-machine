/** Empirical circulation field in normalized chamber coordinates, shared by all
 * ball identities. It approximates a blower, not a full fluid dynamics solver. */
export function airVelocity(x:number,y:number,z:number,seconds:number,phase:number) {
  const jet=Math.exp(-(x*x+z*z)/.24),circulation=3.5*(y+.2),swirl=3.8;
  return {
    x:circulation*x-swirl*z+.9*Math.sin(z*7+seconds*3.7+phase),
    y:8.5*jet-2+.8*Math.sin(x*6-z*5+seconds*4.1+phase),
    z:circulation*z+swirl*x+.9*Math.sin(x*8-seconds*3.3+phase),
  };
}
