import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { LoDGrid3DManager } from './Grid3D.js';
import { TransformControls } from './jsm/controls/TransformControls.js';



import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';



const stats = new Stats()
document.body.appendChild( stats.dom );

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
// scene.background = new THREE.Color(0xAAAAAA);

let ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
let pointLight0 = new THREE.PointLight(0xffffff, 100);
pointLight0.position.set(5,4,5);
scene.add(pointLight0);

const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.01, 50 );
camera.position.set( 2, 2, 6 );



const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.autoClear = false;
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.xr.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.setReferenceSpaceType( 'local' );
document.body.appendChild( renderer.domElement );

document.body.appendChild( VRButton.createButton( renderer ) );

const orbitControls = new OrbitControls(camera, renderer.domElement);
// orbitControls.enablePan = false;
// orbitControls.enableRotate = false;
orbitControls.target.set(2, 2, 0);
orbitControls.update()

renderer.xr.addEventListener('sessionstart', (e) => {
  console.log("session starts")

  const baseReferenceSpace = renderer.xr.getReferenceSpace();
  
  const offsetPosition = camera.position;

  // const offsetRotation = camera.quaternion;
  const offsetRotation = new THREE.Quaternion();

  const transform = new XRRigidTransform( offsetPosition.multiplyScalar(-1), offsetRotation ); 
  const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace( transform );

  renderer.xr.setReferenceSpace( teleportSpaceOffset );

  orbitControls.disconnect();
});

renderer.xr.addEventListener('sessionend', (e) => {
  console.log("session end")
  orbitControls.connect();

});




const point0 = new THREE.Vector3(-0.7, -0.1, 0.2);
const point1 = new THREE.Vector3(3.75, 4.5, 1.5);

const points = [point0, point1];

const rayGeometry = new THREE.BufferGeometry().setFromPoints([point0, point1]);
const rayMaterial = new THREE.LineBasicMaterial({
    color: 0x4080ff,
    linewidth: 3,
});
const rayMesh = new THREE.Line(rayGeometry, rayMaterial);
scene.add(rayMesh)
const rayPositions = rayMesh.geometry.attributes.position;

const ray = {
  direction: new THREE.Vector3(),
  origin: new THREE.Vector3(),
}


const maxLoD = 3;
const gridManager = new LoDGrid3DManager(4)
gridManager.addTo(scene)






const sphereGeometry = new THREE.SphereGeometry( 0.05, 16, 16 );
const sphereMaterial = new THREE.MeshPhongMaterial( { color: 0x4499FF, transparent: true, opacity: 0.5 } );
const spheres = [
  new THREE.Mesh(sphereGeometry, sphereMaterial),
  new THREE.Mesh(sphereGeometry, sphereMaterial),
]


scene.add(...spheres);


const sphereGeometry2 = new THREE.SphereGeometry( 0.025, 16, 16 );
const sphereMaterial2 = new THREE.MeshPhongMaterial( { color: 0x2244AA, wireframe: true } );

let inter0 = new THREE.Mesh(sphereGeometry2, sphereMaterial2)
let inter1 = new THREE.Mesh(sphereGeometry2, sphereMaterial2)
scene.add(inter0)
scene.add(inter1)


function updateRay(pId, pos) {
  
  const index = pId * 3;
  rayPositions.array[index] = pos.x;
  rayPositions.array[index+1] = pos.y;
  rayPositions.array[index+2] = pos.z;

  rayPositions.needsUpdate = true;

  points[pId].copy(pos)

  ray.origin.copy(points[0])
  ray.direction.copy(points[1]).sub(points[0]).normalize();

  spheres[0].position.copy(point0);
  spheres[1].position.copy(point1);
  
}

updateRay(0, point0)
updateRay(1, point1)

let requiresUpdate = true;

function recompute() {
  if(requiresUpdate) {
    gridManager.reset()
    initiateMarch(ray);
    gridManager.update();
    requiresUpdate = false;
  }
}



const epsilon = 0.00000001;

const dirSigns = new THREE.Vector3()
const Dir = new THREE.Vector3();
const invDir = new THREE.Vector3();
const timeSteps = new THREE.Vector3();
const resolutionLoD = new Array(maxLoD);
const moves = new THREE.Vector3();


const depths = []
let checks = 0;
function initiateMarch(ray) {
  checks = 0;
  /// set ray to [0,1]² space
  const ray2 = {
    direction: ray.direction.clone().normalize(),
    origin: ray.origin.clone().divideScalar(4)
  }

  /// get ray signs for each axis
  dirSigns.set(
    ray2.direction.x >= 0 ? 1 : 0,
    ray2.direction.y >= 0 ? 1 : 0,
    ray2.direction.z >= 0 ? 1 : 0,
  );

  /// get integer displacements on each axis
  moves.copy(dirSigns).multiplyScalar(2).sub(new THREE.Vector3(1, 1, 1));

  /// inverse of the direction of the ray to avoid 
  invDir.set(
    1 / ray2.direction.x,
    1 / ray2.direction.y,
    1 / ray2.direction.z,
  );

  timeSteps.set(
    1 / ray2.direction.x,
    1 / ray2.direction.y,
    1 / ray2.direction.z,
  );
  timeSteps.multiply(moves)

  Dir.copy(ray2.direction);

  for(let lod = 0; lod < maxLoD; ++lod) {
    resolutionLoD[lod] = 1 / Math.pow(4, lod);
  }

  const {entryPoint, entry, exit} = computeEntryPoint(ray2);

  depths.length = 0
  if(entry < exit)
    stepThroughCell(new THREE.Vector3(0, 0, 0), ray2, entryPoint, entry, exit, 0, entry*4);
  else
    gridManager.showCell(0);


  /// debug

  // showLods()
  inter0.position.copy(ray.origin.clone().addScaledVector(ray.direction, entry*4));
  inter1.position.copy(ray.origin.clone().addScaledVector(ray.direction, exit*4));

  console.log(checks)
  ///
}

function stepThroughCell(cell, ray, entryPoint, entryT, exitT, lod = 0, depth = 0, globalCell = new THREE.Vector3()) {  
  if(lod >= maxLoD)
    return;

  ++checks;

  /// rescaling time from [0,1]² -> [0,4]²
  const timeToExit = (exitT - entryT) * 4;

  /// entry point: [0, 1]²
  /// first point : [0, 4]²
  const firstPoint = entryPoint.clone().sub(cell).multiplyScalar(4);

  const globalCellLod = globalCell.clone().multiplyScalar(4).add(cell);
  /// DEBUG
  gridManager.showCell(lod, globalCellLod);
  /// 

  const nextBoundary = firstPoint.clone().floor().add(dirSigns);
  const closestBoundary = nextBoundary.clone().sub(firstPoint).multiply(invDir);

  closestBoundary.x += closestBoundary.x < epsilon ? timeSteps.x : 0;
  closestBoundary.y += closestBoundary.y < epsilon ? timeSteps.y : 0;
  closestBoundary.z += closestBoundary.z < epsilon ? timeSteps.z : 0;


  const voxel = firstPoint.clone().floor();
  voxel.clamp(new THREE.Vector3(0,0,0), new THREE.Vector3(3,3,3));
  let t = 0;
  let i = 0;
  const hits = new Array(10);
  const voxelHits = new Array(10);
  do {
    hits[i] = t;
    voxelHits[i] = voxel.clone();
    if(closestBoundary.x < closestBoundary.y && closestBoundary.x < closestBoundary.z) {
      t = closestBoundary.x;
      closestBoundary.x += timeSteps.x;
      voxel.x += moves.x;
    }else if(closestBoundary.y < closestBoundary.z) {
      t = closestBoundary.y;
      closestBoundary.y += timeSteps.y;
      voxel.y += moves.y;
    }
    else {
      t = closestBoundary.z;
      closestBoundary.z += timeSteps.z;
      voxel.z += moves.z;
    }

    ++i
  } while(t < timeToExit - epsilon && i < 10)
  hits[i] = timeToExit;

  for(let j = 0; j < i; ++j) {
    const newDepth = depth + hits[j] * resolutionLoD[lod];
    if(newDepth < 10 / (lod*1.25))
    stepThroughCell(
      voxelHits[j].clone(),
      ray,
      firstPoint.clone().addScaledVector(Dir, hits[j]),
      hits[j],
      hits[j+1],
      lod+1,
      newDepth,
      globalCellLod,
    );
  }
}

initiateMarch(ray)



/// used once to enter first box
function computeEntryPoint(ray) {
  const direction = ray.direction.clone();
  const origin = ray.origin.clone();

  const tTo0 = new THREE.Vector3(
    - origin.x / (direction.x != 0 ? direction.x : Infinity),
    - origin.y / (direction.y != 0 ? direction.y : Infinity),
    - origin.z / (direction.z != 0 ? direction.z : Infinity),
  )

  const tTo1 = new THREE.Vector3(
    (1 - origin.x) / (direction.x != 0 ? direction.x : 0),
    (1 - origin.y) / (direction.y != 0 ? direction.y : 0),
    (1 - origin.z) / (direction.z != 0 ? direction.z : 0),
  )
  
  const tMin = new THREE.Vector3(
    Math.max(0, dirSigns.x ? tTo0.x : tTo1.x), 
    Math.max(0, dirSigns.y ? tTo0.y : tTo1.y), 
    Math.max(0, dirSigns.z ? tTo0.z : tTo1.z) 
  );

  const tMax = new THREE.Vector3(
    Math.min(Number.MAX_VALUE, dirSigns.x ? tTo1.x : tTo0.x), 
    Math.min(Number.MAX_VALUE, dirSigns.y ? tTo1.y : tTo0.y), 
    Math.min(Number.MAX_VALUE, dirSigns.z ? tTo1.z : tTo0.z) 
  );

  const entry = Math.max(Math.max(tMin.x, tMin.y), tMin.z);
  const exit = Math.min(Math.min(tMax.x, tMax.y), tMax.z);
  console.log(entry, exit)
  const entryPoint = origin.clone().addScaledVector(direction, entry)

  entryPoint.clamp(new THREE.Vector3(0,0,0), new THREE.Vector3(1,1,1))
  return {entryPoint, entry, exit}
}


const geometry = new THREE.BufferGeometry();
geometry.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );

const controller1 = renderer.xr.getController( 0 );
controller1.add( new THREE.Line( geometry ) );
scene.add( controller1 );

const controller2 = renderer.xr.getController( 1 );
controller2.add( new THREE.Line( geometry ) );
scene.add( controller2 );

const controllerModelFactory = new XRControllerModelFactory();
const controllerGrip1 = renderer.xr.getControllerGrip( 0 );
controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
scene.add( controllerGrip1 );

const controllerGrip2 = renderer.xr.getControllerGrip( 1 );
controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
scene.add( controllerGrip2 );





// Add event listeners for the controllers
controller1.addEventListener('connected', (event) => {
  controller1.userData.gamepad = event.data.gamepad;
});

controller2.addEventListener('connected', (event) => {
  controller2.userData.gamepad = event.data.gamepad;
});



function handleJoystickInput(controller) {
  if (controller.userData.gamepad) {
      const gamepad = controller.userData.gamepad;
      

      // console.log(gamepad, gamepad.axes);
      // Example: Use joystick to move an object in the scene
      const speed = 0.1; // Movement speed
      // if (Math.abs(xAxis) > 0.01 || Math.abs(yAxis) > 0.01) { // Add deadzone
        if (Math.abs(gamepad.axes[0]) > 0.1 || Math.abs(gamepad.axes[1]) > 0.1 ||Math.abs(gamepad.axes[2]) > 0.1 ||Math.abs(gamepad.axes[3]) > 0.1 )  { // Add deadzone
          console.log(`Joystick moved: ${gamepad.axes}`);
          console.log(gamepad);
          // // Example: Move camera or object based on joystick input
          // camera.position.x += xAxis * speed;
          // camera.position.z += yAxis * speed;


          const baseReferenceSpace = renderer.xr.getReferenceSpace();
          
          const offsetPosition = new THREE.Vector3(gamepad.axes[2], gamepad.axes[3], 0); 
          offsetPosition.multiplyScalar(0.002);
          // const offsetRotation = camera.quaternion;
          const offsetRotation = new THREE.Quaternion();

          const transform = new XRRigidTransform( offsetPosition, offsetRotation ); 
          const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace( transform );

          renderer.xr.setReferenceSpace( teleportSpaceOffset );
      }
  }
}

let controller1Moving = false;
controller1.addEventListener('squeezestart', () => {
  console.log('Controller 1: Grip pressed');
  controller1.children[0].material.color.set(0x0000ff)
  controller1Moving = true;
});
controller1.addEventListener('squeezeend', () => {
  console.log('Controller 2: Grip released');
  controller1.children[0].material.color.set(0xffffff)
  controller1Moving = false;
});


controller2.addEventListener('selectstart', () => {
  console.log('Controller 1: Trigger pressed');
  controller2.children[0].material.color.set(0xff0000)
});
controller2.addEventListener('selectend', () => {
  console.log('Controller 1: Trigger released');
  controller2.children[0].material.color.set(0xffffff)
  console.log(controller2.children[0]);
  console.log(controller2)

  const p0 = new THREE.Vector3();
  const dir = new THREE.Vector3(0, 0, -1);
  const p1 = new THREE.Vector3();

  const matrix = new THREE.Matrix4();
  matrix.extractRotation(controller2.matrixWorld);
  
  p0.setFromMatrixPosition(controller2.matrixWorld);
  dir.applyMatrix4(matrix);
  p1.copy(p0).addScaledVector(dir, 10);

  updateRay(0, p0);
  updateRay(1, p1);
  requiresUpdate = true;
});


function movePlayer () {
  if(!controller1Moving)
    return;


  const p0 = new THREE.Vector3();
  const dir = new THREE.Vector3(0, 0, -1);
  const p1 = new THREE.Vector3();

  const matrix = new THREE.Matrix4();
  matrix.extractRotation(controller1.matrixWorld);
  
  p0.setFromMatrixPosition(controller1.matrixWorld);
  dir.applyMatrix4(matrix);
  p1.copy(p0).addScaledVector(dir, 10);

  const baseReferenceSpace = renderer.xr.getReferenceSpace();
          
  const offsetPosition = dir.clone(); 
  offsetPosition.multiplyScalar(-0.02);
  const offsetRotation = new THREE.Quaternion();

  const transform = new XRRigidTransform( offsetPosition, offsetRotation ); 
  const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace( transform );

  renderer.xr.setReferenceSpace( teleportSpaceOffset );
}

const group = new InteractiveGroup();
group.listenToPointerEvents( renderer, camera );
group.listenToXRControllerEvents( controller1 );
group.listenToXRControllerEvents( controller2 );
scene.add( group );

const statsMesh = new HTMLMesh( stats.dom );
statsMesh.scale.setScalar( 20.5 );
statsMesh.position.x = - 0.75;
statsMesh.position.y = 1.7;
statsMesh.position.z = - 0.6;
statsMesh.rotation.y = Math.PI / 4;
group.add( statsMesh );

window.addEventListener('resize', function() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});

const prevTime = performance.now();

function animate() {
  const time = performance.now();
  const delta = time - prevTime;

  camera.position.x = Math.sin(time * 0.0005);

  renderer.render( scene, camera );
  stats.update()
  statsMesh.material.map.update();
  recompute()
  movePlayer()
  // handleJoystickInput(controller1);
}

renderer.setAnimationLoop( animate );





