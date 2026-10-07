import RAPIER from '@dimforge/rapier3d-compat';

export const VENUS_WHEEL={centerY:2.75,radius:1.20,topY:3.95,z:0,turnTicks:108,pauseTicks:36};
type Ball={body:RAPIER.RigidBody;number:number;selected:boolean};
type Event={color:'red'|'blue';number:number;tick:number};
type Pocket={body:RAPIER.RigidBody;walls:RAPIER.Collider[];floor:RAPIER.Collider;ball?:Ball};

/** Four physical single-ball pockets; the motor moves their colliders, never balls. */
export class VenusWheel {
  pockets:Pocket[]=[];events:Event[]=[];released:number[]=[];
  angle=0;quarter=0;accepting=false;requested=false;
  pending?:Ball;
  private turnStart=-1;private nextTurn=0;
  private from=0;private to=0;
  gate:RAPIER.Collider;
  constructor(public world:RAPIER.World,fixed:RAPIER.RigidBody,public offset:number,public color:'red'|'blue',public quota:number){
    this.gate=world.createCollider(RAPIER.ColliderDesc.cylinder(.018,.14).setTranslation(0,3.80,0).setCollisionGroups(0x00100001),fixed);
    for(let i=0;i<4;i++){
      const a=Math.PI/2+i*Math.PI/2;
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(offset+VENUS_WHEEL.radius*Math.cos(a),VENUS_WHEEL.centerY+VENUS_WHEEL.radius*Math.sin(a),0));
      const walls:RAPIER.Collider[]=[];
      for(const axis of ['x','y','z'] as const)for(const side of [-1,1]){
        const size={x:.140,y:.140,z:.140};size[axis]=.012;
        const p={x:0,y:0,z:0};p[axis]=side*.152;
        walls.push(world.createCollider(RAPIER.ColliderDesc.cuboid(size.x,size.y,size.z).setTranslation(p.x,p.y,p.z).setFriction(.15).setRestitution(0).setCollisionGroups(0x00080002),body));
      }
      const floor=walls[2];walls.forEach(c=>c.setEnabled(false));
      this.pockets.push({body,walls,floor});
    }
  }
  get rotating(){return this.turnStart>=0;}
  get drained(){return this.events.length===this.quota&&!this.rotating&&this.pockets.every(p=>!p.ball);}
  private get top(){return this.pockets[(4-this.quarter%4)%4];}
  request(open:boolean){this.requested=open;if(!open)this.close();}
  private close(){this.accepting=false;this.gate.setEnabled(true);}
  step(tick:number){
    if(this.rotating){
      const t=Math.min(1,(tick-this.turnStart)/VENUS_WHEEL.turnTicks),s=t*t*(3-2*t);
      this.angle=this.from+(this.to-this.from)*s;
      if(t===1){
        this.quarter++;this.turnStart=-1;
        const bottom=this.pockets[(2-this.quarter%4+4)%4];
        if(bottom.ball){this.released.push(bottom.ball.number);bottom.ball=undefined;bottom.walls.forEach(c=>c.setEnabled(false));}
        this.nextTurn=tick+VENUS_WHEEL.pauseTicks;
      }
    } else if(tick>=this.nextTurn&&(this.top.ball||this.events.length===this.quota&&!this.drained)){
      this.close();this.from=this.angle;this.to=this.angle+Math.PI/2;this.turnStart=tick;
    }
    for(let i=0;i<4;i++){
      const a=Math.PI/2+i*Math.PI/2+this.angle;
      this.pockets[i].body.setNextKinematicTranslation({x:this.offset+VENUS_WHEEL.radius*Math.cos(a),y:VENUS_WHEEL.centerY+VENUS_WHEEL.radius*Math.sin(a),z:0});
    }
    if(!this.rotating&&this.requested&&this.events.length<this.quota&&!this.top.ball&&!this.pending&&tick>=this.nextTurn){
      this.accepting=true;this.top.walls.forEach(c=>{c.setCollisionGroups(0x00080001);c.setEnabled(true);});
      this.top.floor.setEnabled(false);this.gate.setEnabled(false);
    }
  }
  capture(tick:number,balls:Ball[]){
    if(!this.accepting||this.rotating||this.events.length>=this.quota||this.top.ball)return;
    if(!this.pending){
      this.pending=balls.find(ball=>{const p=ball.body.translation();return !ball.selected&&p.y>3.81&&Math.hypot(p.x-this.offset,p.z)<.045;});
      if(this.pending){
        // The first body crossing the single-ball throat enters the isolated
        // feed circuit. Close the inlet before admitting another body.
        this.pending.body.collider(0).setCollisionGroups(0x0002ffee);this.gate.setEnabled(true);
        this.top.walls.forEach(c=>{c.setCollisionGroups(0x00080002);c.setEnabled(true);});this.top.floor.setEnabled(false);
      }
    }
    for(const ball of this.pending?[this.pending]:[]){
      const p=ball.body.translation();
      if(ball.selected||Math.abs(p.x-this.offset)>.058||Math.abs(p.z)>.058||p.y<VENUS_WHEEL.topY-.055||p.y>VENUS_WHEEL.topY+.058)continue;
      // A complete sphere fits the pocket before closing its entry. Its identity
      // comes from the actual incoming body, with no preselected number.
      ball.selected=true;ball.body.collider(0).setCollisionGroups(0x0002ffee);
      this.top.ball=ball;this.top.walls.forEach(c=>{c.setCollisionGroups(0x00080002);c.setEnabled(true);});
      this.events.push({color:this.color,number:ball.number,tick});this.close();
      this.pending=undefined;
      this.nextTurn=tick+VENUS_WHEEL.pauseTicks;break;
    }
  }
}
