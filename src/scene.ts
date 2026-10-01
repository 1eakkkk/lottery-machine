import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BALL_RADIUS, CHAMBER_RADIUS, CENTER_Y, FLOOR_Y, PORT_Z, PORT_RADIUS,TUBE_RADIUS, ROTOR_Y, ROTOR_X, ROTOR_Z, ANGULAR_SPEED, DT, floorGeometry,tubeGeometry, type Snapshot } from './physics';

export class MachineScene {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: OrbitControls;
  balls: THREE.Mesh[] = []; rotors: THREE.Group[][] = []; gates: THREE.Mesh[] = [];
  outletGates:THREE.Mesh[]=[];
  observer: ResizeObserver; initialPosition = new THREE.Vector3(0, 4.7, 9.5);
  constructor(public container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setClearColor('#eeeee9'); this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute('aria-label', '双色球三维机械开奖机器，可拖动旋转视角');
    this.container.append(this.renderer.domElement);
    this.scene.fog = new THREE.Fog('#eeeee9', 14, 24);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40); this.camera.position.copy(this.initialPosition);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2.1, 0); this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.minDistance = 5; this.controls.maxDistance = 15; this.controls.maxPolarAngle = Math.PI / 2; this.controls.minPolarAngle = 0.35;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b3b3a8', 3));
    const key = new THREE.DirectionalLight('#fff7e5', 4); key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6; key.shadow.bias = -0.001;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#d6e4ff', 2); fill.position.set(4, 4, -3); this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#eeeee9', roughness: 0.78 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    this.machine(-1.45, '#e74337', 33, 'RED  /  33'); this.machine(1.45, '#3478c1', 16, 'BLUE  /  16');
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize();
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
    for (const side of [-1, 1]) {
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
    const tube=tubeGeometry(),tubeMesh=new THREE.BufferGeometry();tubeMesh.setAttribute('position',new THREE.BufferAttribute(tube.vertices,3));tubeMesh.setIndex(new THREE.BufferAttribute(tube.indices,1));tubeMesh.computeVertexNormals();this.mesh(tubeMesh,glass.clone(),x,0,0);
    for (const y of [1.02, 1.8]) this.ring(TUBE_RADIUS + 0.01, x, y, PORT_Z, bronze);
    this.gates.push(this.mesh(new THREE.CylinderGeometry(PORT_RADIUS + 0.02, PORT_RADIUS + 0.02, 0.036, 32), dark, x, FLOOR_Y - 0.03, PORT_Z));
    this.outletGates.push(this.mesh(new THREE.CylinderGeometry(PORT_RADIUS+.02,PORT_RADIUS+.02,.036,32),dark,x,FLOOR_Y-.26,PORT_Z));
    this.mesh(new THREE.BoxGeometry(1.5, 0.05, 0.44), steel, x, 0.63, PORT_Z).rotation.z=.08;
    for (const side of [-1, 1]) this.mesh(new THREE.BoxGeometry(1.5, 0.22, 0.05), glass.clone(), x, 0.76, PORT_Z + side * 0.22);
    this.mesh(new THREE.PlaneGeometry(.88,.22),new THREE.MeshBasicMaterial({map:this.textTexture('一刻开奖','#ffffff','#234771')}),x,1.02,.34);
    this.mesh(new THREE.PlaneGeometry(.70,.18),new THREE.MeshBasicMaterial({map:this.textTexture(name,'#dce7f1','#234771')}),x,.82,.34);
    for (let i = 0; i < count; i++) {
      const ball = this.mesh(new THREE.SphereGeometry(BALL_RADIUS, 18, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0.07 }), x, 2.8, 0);
      const labelCanvas=document.createElement('canvas');labelCanvas.width=128;labelCanvas.height=128;
      const ctx=labelCanvas.getContext('2d')!;ctx.fillStyle='#fff9ed';ctx.beginPath();ctx.arc(64,64,58,0,Math.PI*2);ctx.fill();ctx.fillStyle='#303833';ctx.font='700 55px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1).padStart(2,'0'),64,67);
      const numberTexture=new THREE.CanvasTexture(labelCanvas);numberTexture.colorSpace=THREE.SRGBColorSpace;
      // The label faces the viewer but the ball's rotation remains the physics rotation.
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture, depthTest: true })); sprite.scale.set(0.08, 0.08, 1);
      sprite.position.z = BALL_RADIUS + 0.003; ball.add(sprite); this.balls.push(ball);
    }
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height); this.camera.aspect = width / height;
    const distance = width < 600 ? 11.5 : 9.5; this.camera.position.set(0, 4.7, distance);
    this.camera.fov = width < 600 ? 48 : 34; this.camera.updateProjectionMatrix();
  }
  update(s: Snapshot, seedPhase: number, blueStart: number) {
    this.balls.forEach((ball, i) => {
      const j = i * 8; ball.position.set(s.balls[j], s.balls[j + 1], s.balls[j + 2]); ball.quaternion.set(s.balls[j + 3], s.balls[j + 4], s.balls[j + 5], s.balls[j + 6]);
      ball.children[0].position.copy(this.camera.position).sub(ball.position).normalize().multiplyScalar(BALL_RADIUS+.003).applyQuaternion(ball.quaternion.clone().invert());
    });
    const redMoving = s.tick >= 240 && s.events.filter(e => e.color === 'red').length < 6;
    const blueMoving = blueStart > 0 && s.tick >= blueStart;
    this.rotors.forEach((group, c) => group.forEach((rotor, i) => {
      const moving = c === 0 ? redMoving : blueMoving, tick = c === 0 ? s.tick : s.tick - blueStart;
      const stoppedTick=c===0?s.events.filter(e=>e.color==='red')[5]?.tick:undefined;
      const a = moving ? (i===0?1:-1)*(tick*DT*ANGULAR_SPEED+seedPhase+c):stoppedTick?(i===0?1:-1)*(stoppedTick*DT*ANGULAR_SPEED+seedPhase):0;
      const tilt=0,st=Math.sin(tilt/2),ct=Math.cos(tilt/2),sa=Math.sin(a/2),ca=Math.cos(a/2);
      rotor.quaternion.set(-st*sa,ct*sa,st*ca,ct*ca);
    }));
    this.gates.forEach((gate, i) => { gate.visible = !s.gate[i]; });
    this.outletGates.forEach((gate,i)=>{gate.visible=!s.outlet[i];});
  }
  render() { this.controls.update(); this.renderer.render(this.scene, this.camera); }
  view(name: string) {
    if (name === 'red') { this.camera.position.set(-1.45, 3.5, 5.2); this.controls.target.set(-1.45, 2.5, 0); }
    else if (name === 'blue') { this.camera.position.set(1.45, 3.5, 5.2); this.controls.target.set(1.45, 2.5, 0); }
    else { this.camera.position.set(0, 4.7, this.container.clientWidth < 600 ? 11.5 : 9.5); this.controls.target.set(0, 2.1, 0); }
  }
}
