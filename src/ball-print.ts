import * as THREE from 'three';

// Bake the repeated print into the ball's own UV texture. No raised decal mesh.
const WIDTH=768, HEIGHT=384, LABEL_SIZE=128;
let printPixels:Int32Array|undefined;
function sphericalPrintPixels(){
  if(printPixels)return printPixels;
  const pixels=new Int32Array(WIDTH*HEIGHT).fill(-1),extent=Math.sin(.50);
  const frames:THREE.Quaternion[]=[];
  for(const a of [-1,1])for(const b of [-1,1])for(const normal of [[a,b,0],[a,0,b],[0,a,b]]){
    frames.push(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...normal).normalize()).invert());
  }
  const surface=new THREE.Vector3(),local=new THREE.Vector3();
  for(let row=0;row<HEIGHT;row++)for(let col=0;col<WIDTH;col++){
    const theta=(row+.5)/HEIGHT*Math.PI,phi=(col+.5)/WIDTH*Math.PI*2;
    // Matches SphereGeometry's longitude, pole and canvas flipY convention.
    surface.set(-Math.cos(phi)*Math.sin(theta),Math.cos(theta),Math.sin(phi)*Math.sin(theta));
    for(const frame of frames){
      local.copy(surface).applyQuaternion(frame);
      if(local.z<Math.cos(.50))continue;
      const x=Math.max(0,Math.min(127,Math.floor((.5+local.x/(2*extent))*LABEL_SIZE)));
      const y=Math.max(0,Math.min(127,Math.floor((.5-local.y/(2*extent))*LABEL_SIZE)));
      pixels[row*WIDTH+col]=(y*LABEL_SIZE+x)*4;break;
    }
  }
  return printPixels=pixels;
}

export function printedBallTexture(label:HTMLCanvasElement,color:string){
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
  const context=canvas.getContext('2d')!;
  context.fillStyle=color;context.fillRect(0,0,WIDTH,HEIGHT);
  const image=context.getImageData(0,0,WIDTH,HEIGHT),ink=label.getContext('2d')!.getImageData(0,0,LABEL_SIZE,LABEL_SIZE).data;
  const pixels=sphericalPrintPixels();
  for(let i=0;i<pixels.length;i++){
    const source=pixels[i];if(source<0)continue;
    const alpha=ink[source+3]/255;if(!alpha)continue;
    for(let channel=0;channel<3;channel++)image.data[i*4+channel]=Math.round(ink[source+channel]*alpha+image.data[i*4+channel]*(1-alpha));
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
