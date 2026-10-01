import * as THREE from 'three';
import { numberedBallSurface } from './ball-label';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GAMES, receivingTray, eventZone, type GameId } from './games';
import { BALL_RADIUS, CHAMBER_RADIUS, CENTER_Y, FLOOR_Y, PORT_Z, PORT_RADIUS,TUBE_RADIUS, ROTOR_Y, ROTOR_X, ROTOR_Z, ANGULAR_SPEED, DT, floorGeometry,tubeGeometry, type Snapshot } from './physics';

export class MachineScene {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: OrbitControls;
  balls: THREE.Mesh[] = []; rotors: THREE.Group[][] = []; gates: THREE.Mesh[] = [];
  outletGates:THREE.Mesh[]=[];
  private currentView = 'all';
  private resultRack = new THREE.Group();
  private resultMoves: { ball: THREE.Mesh; from: THREE.Vector3; rotation: THREE.Quaternion; to: THREE.Vector3; start: number }[] = [];
  private resultShown = false;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private displayRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,1,0).normalize(), new THREE.Vector3(0,0,1));
  observer: ResizeObserver; initialPosition = new THREE.Vector3(0, 4.7, 9.5);
  constructor(public container: HTMLElement, public game:GameId='ssq') {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setClearColor('#eeeee9'); this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute('aria-label', `${GAMES[game].title}三维开奖机器，可拖动旋转视角`);
    this.container.append(this.renderer.domElement);
    this.scene.fog = new THREE.Fog('#eeeee9', 35, 65);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.025, 80); this.camera.position.copy(this.initialPosition);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2.1, 0); this.controls.enableDamping = true; this.controls.enablePan = true;
    this.controls.screenSpacePanning = true; this.controls.zoomToCursor = true; this.controls.zoomSpeed = 1.15;
    this.controls.minDistance = .65; this.controls.maxDistance = 35; this.controls.maxTargetRadius = 12;
    this.controls.maxPolarAngle = Math.PI / 2; this.controls.minPolarAngle = .1;
    this.renderer.domElement.tabIndex = 0; this.controls.listenToKeyEvents(this.renderer.domElement);
    this.configureGestures();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b3b3a8', 3));
    const key = new THREE.DirectionalLight('#fff7e5', 4); key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6; key.shadow.bias = -0.001;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#d6e4ff', 2); fill.position.set(4, 4, -3); this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#eeeee9', roughness: 0.78 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const config=GAMES[game];
    if(game==='kl8')this.displayRotation.setFromUnitVectors(new THREE.Vector3(1,1,0).normalize(),new THREE.Vector3(0,.6,.8));
    config.offsets.forEach((x,i)=>this.machine(x,config.colors[i],config.counts[i],`${config.zones[i]}  /  ${config.counts[i]}`));
    this.createResultRack();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize();
  }
  private createResultRack() {
    this.scene.add(this.resultRack); this.resultRack.visible=false;
    const steel = this.material('#bfc5c2');
    this.mesh(new THREE.BoxGeometry(this.game==='kl8'?3.5:2.85,.07,this.game==='kl8'?.80:.40),steel,0,.46,1.3,this.resultRack);
    for(const x of [-1.14,1.14]) this.mesh(new THREE.BoxGeometry(.055,.42,.12),steel,x,.23,1.3,this.resultRack);
    for (let i = 0; i < GAMES[this.game].draws.reduce((a,b)=>a+b,0); i++) {
      const x = this.resultX(i);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.074,.009,8,24),steel);
      ring.rotation.x = Math.PI / 2; ring.position.set(x,.508,this.resultZ(i)); this.resultRack.add(ring);
    }
  }
  private resultX(index:number) {const count=GAMES[this.game].draws.reduce((a,b)=>a+b,0);return ((this.game==='kl8'?index%10:index)-(Math.min(count,10)-1)/2)*.31;}
  private resultZ(index:number) {return this.game==='kl8'?1.15+Math.floor(index/10)*.34:1.3;}
  setDragMode(pan: boolean) {
    this.controls.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }
  private zoomAt(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect(), raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),this.camera);
    const hit = raycaster.intersectObjects(this.balls,true)[0];
    const focus = hit?.point.clone() ?? this.controls.target.clone();
    const direction = this.camera.position.clone().sub(focus);
    const distance = Math.max(this.controls.minDistance,direction.length()*.55);
    this.camera.position.copy(focus).add(direction.normalize().multiplyScalar(distance));
    this.controls.target.copy(focus); this.controls.update();
  }
  private configureGestures() {
    const canvas = this.renderer.domElement;
    let lastTouch = 0, lastTap: { x: number; y: number; time: number } | undefined;
    const fingers = new Map<number,{ x: number; y: number; time: number }>();
    let multipleFingers = false;
    canvas.addEventListener('pointerdown',event=>{
      if(event.pointerType!=='touch') return;
      lastTouch=performance.now();
      if(fingers.size===0) multipleFingers=false;
      fingers.set(event.pointerId,{x:event.clientX,y:event.clientY,time:lastTouch});
      if(fingers.size>1) { multipleFingers=true; lastTap=undefined; }
    });
    canvas.addEventListener('pointerup',event=>{
      if(event.pointerType!=='touch') return;
      const start=fingers.get(event.pointerId), now=performance.now(); fingers.delete(event.pointerId); lastTouch=now;
      if(!start||multipleFingers||now-start.time>280||Math.hypot(event.clientX-start.x,event.clientY-start.y)>12) {lastTap=undefined;return;}
      if(lastTap&&now-lastTap.time<320&&Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<24){
        event.preventDefault();this.zoomAt(event.clientX,event.clientY);lastTap=undefined;
      }else lastTap={x:event.clientX,y:event.clientY,time:now};
    },{passive:false});
    canvas.addEventListener('pointercancel',event=>{fingers.delete(event.pointerId);lastTap=undefined;});
    canvas.addEventListener('dblclick',event=>{event.preventDefault();if(performance.now()-lastTouch>600)this.zoomAt(event.clientX,event.clientY);});
    const gestureTarget=this.container.closest('.studio')??canvas;
    for(const name of ['gesturestart','gesturechange','gestureend']) gestureTarget.addEventListener(name,event=>event.preventDefault(),{passive:false});
  }
  material(color: THREE.ColorRepresentation, metalness = 0.65) { return new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.25 }); }
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  ring(radius: number, x: number, y: number, z: number, material: THREE.Material) {
    const ring = this.mesh(new THREE.TorusGeometry(radius, 0.014, 8, 80), material, x, y, z); ring.rotation.x = Math.PI / 2; return ring;
  }
  textTexture(text: string, color: string, background: string) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = color;
    ctx.font = '600 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  machine(x: number, color: string, count: number, name: string) {
    const tray=receivingTray(this.game);
    const steel = this.material('#bfc5c2'), dark = this.material('#333a38'), bronze = this.material('#b8aa81');
    const white = this.material('#dcded8', 0.2);
    this.mesh(new THREE.BoxGeometry(1.40,.10,.94),steel,x,.12,-.1);
    this.mesh(new THREE.BoxGeometry(1.32,1.32,.82),white,x,.84,-.1);
    this.mesh(new THREE.BoxGeometry(1.18,1.08,.015),this.material('#234771',.15),x,.82,.319);
    this.mesh(new THREE.BoxGeometry(1.48,.085,.82),steel,x,1.55,-.1);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      this.mesh(new THREE.CylinderGeometry(.055,.055,.12,16),dark,x+sx*.55,.055,-.1+sz*.34).rotation.z=Math.PI/2;
      this.mesh(new THREE.CylinderGeometry(.025,.025,.34,12),steel,x+sx*.57,1.74,sz*.27);
    }
    const radius = Math.sqrt(CHAMBER_RADIUS ** 2 - (FLOOR_Y - CENTER_Y) ** 2);
    this.ring(radius, x, FLOOR_Y, 0, bronze);
    const glass = new THREE.MeshPhysicalMaterial({ color: '#d5e4df', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.065, side: THREE.DoubleSide, depthWrite: false });
    const angle = Math.acos((FLOOR_Y - CENTER_Y) / CHAMBER_RADIUS);
    this.mesh(new THREE.SphereGeometry(CHAMBER_RADIUS, 64, 40, 0, Math.PI * 2, 0, angle), glass, x, CENTER_Y, 0).castShadow = false;
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(CHAMBER_RADIUS + 0.007, 0.011, 8, 100, angle * 2), bronze);
    meridian.rotation.z = Math.PI / 2 - angle; meridian.position.set(x, CENTER_Y, 0); this.scene.add(meridian);
    const meridian2 = meridian.clone(); meridian2.rotation.y = Math.PI / 2; this.scene.add(meridian2);
    this.ring(CHAMBER_RADIUS, x, CENTER_Y, 0, new THREE.MeshStandardMaterial({ color: '#bdc8c3', metalness: 0.5, transparent: true, opacity: 0.48 }));
    this.mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.14, 24), steel, x, CENTER_Y + CHAMBER_RADIUS + 0.04, 0);
    this.mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.17, 24), dark, x, CENTER_Y + CHAMBER_RADIUS + 0.19, 0);
    // Floor has the same opening as the physical port.
    const floor = floorGeometry(), deckGeometry = new THREE.BufferGeometry();
    deckGeometry.setAttribute('position',new THREE.BufferAttribute(floor.vertices,3)); deckGeometry.setIndex(new THREE.BufferAttribute(floor.indices,1)); deckGeometry.computeVertexNormals();
    const deckMaterial=steel.clone();deckMaterial.side=THREE.DoubleSide;this.mesh(deckGeometry,deckMaterial,x,0,0);
    const rotorGroups: THREE.Group[] = [];
    for (const side of GAMES[this.game].mixing==='airflow'?[]:[-1, 1]) {
      const rotor = new THREE.Group(); rotor.position.set(x + side * ROTOR_X, ROTOR_Y, ROTOR_Z); this.scene.add(rotor);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const blade = this.mesh(new THREE.BoxGeometry(0.47, 0.07, 0.14), bronze, 0.235 * Math.cos(a), 0, -0.235 * Math.sin(a), rotor);
        const s=Math.sin(a/2),c=Math.cos(a/2),sp=Math.sin(.3),cp=Math.cos(.3);blade.quaternion.set(c*sp,s*cp,-s*sp,c*cp);
      }
      const hub = this.mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.43, 20), dark, 0, 0, 0, rotor); hub.rotation.x = Math.PI / 2;
      rotorGroups.push(rotor);
    }
    this.rotors.push(rotorGroups);
    if(GAMES[this.game].mixing==='airflow') {
      // Visible blower manifold instead of mechanical paddles.
      for(const side of [-1,1]) {
        this.mesh(new THREE.CylinderGeometry(.075,.075,.62,20),steel,x+side*.46,1.86,-.27);
        this.mesh(new THREE.CylinderGeometry(.11,.075,.12,20),dark,x+side*.46,2.20,-.27);
      }
      this.mesh(new THREE.CylinderGeometry(.31,.31,.25,32),dark,x,1.50,-.18);
    }
    const tube=tubeGeometry(),tubeMesh=new THREE.BufferGeometry();tubeMesh.setAttribute('position',new THREE.BufferAttribute(tube.vertices,3));tubeMesh.setIndex(new THREE.BufferAttribute(tube.indices,1));tubeMesh.computeVertexNormals();this.mesh(tubeMesh,glass.clone(),x,0,0);
    for (const y of [1.02, 1.8]) this.ring(TUBE_RADIUS + 0.01, x, y, PORT_Z, bronze);
    this.gates.push(this.mesh(new THREE.CylinderGeometry(PORT_RADIUS + 0.02, PORT_RADIUS + 0.02, 0.036, 32), dark, x, FLOOR_Y - 0.03, PORT_Z));
    this.outletGates.push(this.mesh(new THREE.CylinderGeometry(PORT_RADIUS+.02,PORT_RADIUS+.02,.036,32),dark,x,FLOOR_Y-.26,PORT_Z));
    this.mesh(new THREE.BoxGeometry(tray.halfLength*2, .05, tray.halfWidth*2), steel, x+tray.centerX, tray.y, PORT_Z).rotation.z=tray.slope;
    const railGlass=glass.clone();railGlass.opacity=.23;
    if(tray.halfLength>2) {
      const left=tray.centerX-tray.halfLength,right=-.35,cx=(left+right)/2;
      this.mesh(new THREE.BoxGeometry(right-left,.03,tray.halfWidth*2),railGlass,x+cx,tray.y+(cx-tray.centerX)*Math.tan(tray.slope)+.22,PORT_Z).rotation.z=tray.slope;
    }
    for (const side of [-1, 1]) {
      this.mesh(new THREE.BoxGeometry(tray.halfLength*2+.05, tray.wallHalfHeight*2, .05), railGlass, x+tray.centerX, tray.wallY, PORT_Z+side*(tray.halfWidth+.025));
      this.mesh(new THREE.BoxGeometry(.05, tray.wallHalfHeight*2, tray.halfWidth*2), steel, x+tray.centerX+side*(tray.halfLength+.025), tray.wallY, PORT_Z);
    }
    this.mesh(new THREE.PlaneGeometry(.88,.22),new THREE.MeshBasicMaterial({map:this.textTexture('一刻开奖','#ffffff','#234771')}),x,1.02,.34);
    this.mesh(new THREE.PlaneGeometry(.70,.18),new THREE.MeshBasicMaterial({map:this.textTexture(name,'#dce7f1','#234771')}),x,.82,.34);
    const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 24);
    const labelGeometry = numberedBallSurface(BALL_RADIUS + .0012);
    const grain = new Uint8Array(64 * 64);
    for (let i = 0; i < grain.length; i++) grain[i] = 110 + Math.floor(Math.random() * 36);
    const rubberTexture = new THREE.DataTexture(grain, 64, 64, THREE.RedFormat); rubberTexture.needsUpdate = true;
    rubberTexture.wrapS = rubberTexture.wrapT = THREE.RepeatWrapping;
    const ballMaterial = new THREE.MeshPhysicalMaterial({ color, roughness: .45, metalness: 0, clearcoat: .12, clearcoatRoughness: .48, bumpMap: rubberTexture, bumpScale: .00015 });
    for (let i = 0; i < count; i++) {
      const ball = this.mesh(ballGeometry, ballMaterial, x, 2.8, 0);
      const labelCanvas=document.createElement('canvas');labelCanvas.width=128;labelCanvas.height=128;
      const ctx=labelCanvas.getContext('2d')!;ctx.fillStyle='#fff9ed';ctx.beginPath();ctx.arc(64,64,58,0,Math.PI*2);ctx.fill();ctx.fillStyle='#080808';ctx.font='600 62px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(this.game==='fc3d'?i:i+1),64,67);
      const numberTexture=new THREE.CanvasTexture(labelCanvas);numberTexture.colorSpace=THREE.SRGBColorSpace;
      const labelMaterial = new THREE.MeshStandardMaterial({ map: numberTexture, transparent: true, alphaTest: .5, roughness: .9, metalness: 0 });
      // Repeated curved prints rotate and become occluded with the physical ball.
      ball.add(new THREE.Mesh(labelGeometry, labelMaterial));
      this.balls.push(ball);
    }
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if(width<1||height<1) return;
    const previousAspect=this.camera.aspect;
    this.renderer.setSize(width, height); this.camera.aspect = width / height;
    this.camera.fov = 36; this.camera.updateProjectionMatrix();
    // Preserve a custom view on ordinary resize; fit again after an orientation change.
    if(Math.abs(previousAspect-this.camera.aspect)>.4||this.camera.position.equals(this.initialPosition)) this.view(this.currentView);
  }
  update(s: Snapshot, seedPhase: number, blueStart: number) {
    // During the draw, every mesh follows its physical receiving lane without relocation.
    if(s.phase!=='complete') {this.resultMoves=[];this.resultShown=false;this.resultRack.visible=false;}
    this.balls.forEach((ball, i) => {
      const j = i * 8; ball.position.set(s.balls[j], s.balls[j + 1], s.balls[j + 2]); ball.quaternion.set(s.balls[j + 3], s.balls[j + 4], s.balls[j + 5], s.balls[j + 6]);
    });
    const frontTarget=GAMES[this.game].draws[0];
    const redMoving = s.tick >= 240 && s.events.filter(e => e.color === 'red').length < frontTarget;
    const blueMoving = blueStart > 0 && s.tick >= blueStart;
    this.rotors.forEach((group, c) => group.forEach((rotor, i) => {
      const moving = c === 0 ? redMoving : blueMoving, tick = c === 0 ? s.tick : s.tick - blueStart;
      const stoppedTick=c===0?s.events.filter(e=>e.color==='red')[frontTarget-1]?.tick:undefined;
      const actual=s.rotorRotations?.[c];
      if(actual?.length){rotor.quaternion.fromArray(actual,i*4);return;}
      const a = moving ? (i===0?1:-1)*(tick*DT*ANGULAR_SPEED+seedPhase+c):stoppedTick?(i===0?1:-1)*(stoppedTick*DT*ANGULAR_SPEED+seedPhase):0;
      const tilt=0,st=Math.sin(tilt/2),ct=Math.cos(tilt/2),sa=Math.sin(a/2),ca=Math.cos(a/2);
      rotor.quaternion.set(-st*sa,ct*sa,st*ca,ct*ca);
    }));
    this.gates.forEach((gate, i) => { gate.visible = !s.gate[i]; });
    this.outletGates.forEach((gate,i)=>{gate.visible=!s.outlet[i];});
    if(s.phase==='complete'&&!this.resultShown) {
      this.resultShown=true;this.resultRack.visible=true;
      for(let index=0;index<s.events.length;index++) {
        const event=s.events[index];
        const zone=eventZone(event),offset=GAMES[this.game].counts.slice(0,zone).reduce((a,b)=>a+b,0);
        const ball=this.balls[offset+event.number-(this.game==='fc3d'?0:1)];
        this.resultMoves.push({ball,from:ball.position.clone(),rotation:ball.quaternion.clone(),to:new THREE.Vector3(this.resultX(index),.588,this.resultZ(index)),start:performance.now()});
      }
    }
  }
  render() {
    for(const move of this.resultMoves){
      const progress=this.reducedMotion?1:Math.min(1,(performance.now()-move.start)/900), eased=1-(1-progress)**3;
      move.ball.position.lerpVectors(move.from,move.to,eased);move.ball.quaternion.slerpQuaternions(move.rotation,this.displayRotation,eased);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
  view(name: string) {
    this.currentView = name;
    if (name === 'results' || (name==='tray'&&this.resultShown)) {
      const distance=Math.max(2.8,(this.game==='kl8'?3.8:3)/(2*Math.tan(THREE.MathUtils.degToRad(18))*this.camera.aspect));
      this.camera.position.set(0,this.game==='kl8'?.588+distance*.75:1.4,1.3+distance);this.controls.target.set(0,.588,1.3);
    }
    else if(name==='tray'){const tray=receivingTray(this.game),x=GAMES[this.game].offsets[0]+tray.centerX;this.camera.position.set(x,1.5,PORT_Z+Math.max(3,(tray.halfLength*2+.4)/(2*Math.tan(THREE.MathUtils.degToRad(18))*this.camera.aspect)));this.controls.target.set(x,.8,PORT_Z);}
    else if(['red','blue','third'].includes(name)) {
      const x=GAMES[this.game].offsets[['red','blue','third'].indexOf(name)]??0;
      this.camera.position.set(x,3.5,Math.max(4.4,2.4/(2*Math.tan(THREE.MathUtils.degToRad(18))*this.camera.aspect)));
      this.controls.target.set(x,2.5,0);
    }
    else {
      const distance = Math.max(7.2, (this.game==='fc3d'?8.8:this.game==='kl8'?6: GAMES[this.game].counts.length===1?3.8:5.8) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
      const center=this.game==='kl8'?-1.35:0;
      this.camera.position.set(center, 1.85 + distance * .25, distance); this.controls.target.set(center, 1.85, 0);
    }
  }
}
