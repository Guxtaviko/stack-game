import './style.css'
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

let scene, camera, renderer, world;
let gameStarted = false;
let stack = [];
let overhangs = [];
let speed = 0.15;
let count = 0;
let msg = '';
let perfect;
let perfectObj;
let topLayer;
const help = 0.1;
const instructions = document.querySelector('.instructions')
const score = document.querySelector('.score')
const feedback = document.querySelector('.feedback')
const originalBoxSize = 3;
const boxHeight = 0.5;
const startColor = Math.round(Math.random() * (720 - 360) + 360);
const volumeRange = document.querySelector('#volume')

// Audio
const sounds = {
  placement: new Audio("/audio/placement.wav"),
  perfect: new Audio("/audio/perfect-placement.wav"),
  gameOver: new Audio("/audio/game-over.wav")
}

for (const key in sounds) {
  if (Object.hasOwnProperty.call(sounds, key)) {
    const audio = sounds[key];
    audio.volume = 0.3
  }
}

volumeRange.addEventListener('change', () => {
  for (const key in sounds) {
    if (Object.hasOwnProperty.call(sounds, key)) {
      const audio = sounds[key];
      audio.volume = volumeRange.value
    }
  }
})

document.body.style.backgroundImage = 
  `linear-gradient(hsl(${startColor} , 100%, 25%) 0%, hsl(${startColor} , 100%, 75%) 100%)`;

function init() {
  // Initializate CannonJs
  world = new CANNON.World();
  world.gravity.set(0, -10, 0); // Gravity pulls things down
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  // Initializate ThreeJs
  scene = new THREE.Scene();

  // Foundation
  for (let i = 0; i < 20; i++) {
    generateFundation(boxHeight * i) 
  }
  addLayer(0, 0, originalBoxSize, originalBoxSize);

  // First layer
  addLayer(-17, 0, originalBoxSize, originalBoxSize, "x");

  // Set up lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(10, 20, 0);
  scene.add(directionalLight);

  // Camera
  let width
  if (window.innerWidth < 600) {
    width = 5
  } else {
    width = 15;
  }
  const height = width * (window.innerHeight / window.innerWidth);
  camera = new THREE.OrthographicCamera(
    width / -2, // left
    width / 2, // right
    height / 2, // top
    height / -2, //bbottom
    1, // near
    100 // far
  );
  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor( 0xffffff, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
  document.body.appendChild(renderer.domElement)

}

init()

window.addEventListener("click", () => {
  if(!gameStarted) {
    instructions.style.display = 'none'
    renderer.setAnimationLoop(animation);
    gameStarted = true;
  } else {
    topLayer = stack[stack.length - 1];
    const previousLayer = stack[stack.length - 2];

    const direction = topLayer.direction;

    let delta = 
      topLayer.threejs.position[direction] -
      previousLayer.threejs.position[direction];
    
    msg = delta > 0 ? 'Muito tarde!' : 'Muito cedo!'
    
    let overhangSize = Math.abs(delta)
    const size = direction == "x" ? topLayer.width : topLayer.depth;
    let overlap = size - overhangSize
    
    if (overlap > 0) {
      count++
      if (overhangSize < help) {
        perfect = true;
        overhangSize = 0
        delta = 0
        overlap = size
        count++
        msg = 'Perfeito +2'

        topLayer.threejs.position.copy(previousLayer.threejs.position)
        topLayer.threejs.position.y += boxHeight

        topLayer.cannonjs.position.copy(previousLayer.threejs.position)
        topLayer.cannonjs.position.y += boxHeight

        generatePerfect(topLayer.threejs.position.y, 1)

        sounds.perfect.play()
      } else {
        perfect = false;
        sounds.placement.play()
      }

      score.innerHTML=count

      // Cut Layer
      const newWidth = direction == "x" ? overlap : topLayer.width
      const newDepth = direction == "z" ? overlap : topLayer.depth

      // Update metadata
      topLayer.width = newWidth
      topLayer.depth = newDepth

      // Update ThreeJS model
      topLayer.threejs.scale[direction] = overlap / size;
      topLayer.threejs.position[direction] -= delta / 2;

      // Update CannonJS model
      topLayer.cannonjs.position[direction] -= delta / 2;
      // Update Shape
      const shape = new CANNON.Box(
        new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
      );
      topLayer.cannonjs.shapes = [];
      topLayer.cannonjs.addShape(shape);

      if (!perfect) {
        // Overhang
        const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
        const overhangX = 
          direction == 'x'
            ? topLayer.threejs.position.x + overhangShift
            : topLayer.threejs.position.x;
        const overhangZ =
          direction == 'z'
            ? topLayer.threejs.position.z + overhangShift
            : topLayer.threejs.position.z;
        const overhangWidth = direction == "x" ? overhangSize : newWidth;
        const overhangDepth = direction == "z" ? overhangSize : newDepth;

        addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);
      }


      // Next Layer
      const nextX = direction == "x" ? topLayer.threejs.position.x : -15;
      const nextZ = direction == "z" ? topLayer.threejs.position.z : -15;
      const nextDirection = direction == "x" ? "z" : "x";

      addLayer(nextX, nextZ, newWidth, newDepth, nextDirection)
    } else {
      sounds.gameOver.play()
      renderer.setAnimationLoop(() => {
        topLayer.threejs.position.y -= 0.25
        topLayer.threejs.quaternion.random()

        renderer.render(scene, camera);
      });
      instructions.innerHTML = `      <h1>VOCÊ PERDEU</h1>
      <p>Pontuação Final: ${count}</p>
      <h3>Clique para reiniciar</h3>`
      instructions.style.display = 'flex'
      instructions.addEventListener('click', () => {
        location.reload()
      })
    }
    showFeedback(msg)
  }
})

function addLayer(x, z, width, depth, direction) {
  const y = boxHeight * stack.length;

  const layer = generateBox(x, y, z, width, depth, false);
  layer.direction = direction

  stack.push(layer)
}

function addOverhang(x, z, width, depth) {
  const y = boxHeight * (stack.length - 1);
  const overhang = generateBox(x, y, z, width, depth, true)
  overhangs.push(overhang)
}

function generateBox(x, y, z, width, depth, falls) {
  // ThreeJS
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);

  const color = new THREE.Color(`hsl(${startColor + stack.length * 4}, 100%, 50%)`)
  const material = new THREE.MeshLambertMaterial({ color });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);

  scene.add(mesh);

  // CannonJS
  const shape = new CANNON.Box(
    new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
  );
  let mass = falls ? 5: 0;
  const body = new CANNON.Body({mass, shape});
  body.position.set(x, y, z);
  world.addBody(body)

  return {
    threejs: mesh,
    cannonjs: body,
    width,
    depth
  };
}

function generateFundation(height) {
  const geometry = new THREE.BoxGeometry(originalBoxSize, boxHeight, originalBoxSize);
  const color = new THREE.Color(`hsl(${startColor - height * 8}, 100%, 50%)`)
  const material = new THREE.MeshLambertMaterial({ color });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, height * -1, 0);

  scene.add(mesh);
}

function generatePerfect(height, size) {
  const geometry = new THREE.BoxGeometry(topLayer.width + topLayer.width/3, 0, topLayer.depth + topLayer.width/3)
  const color = new THREE.Color(0xffffff)
  const material = new THREE.MeshLambertMaterial({ color, emissive: 0xffffff});
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(topLayer.threejs.position.x, height, topLayer.threejs.position.z);
  perfectObj = mesh
  scene.add(mesh);
}



function animation() {
  const topLayer = stack[stack.length - 1];
  topLayer.threejs.position[topLayer.direction] += speed;
  topLayer.cannonjs.position[topLayer.direction] += speed;

  if (topLayer.threejs.position[topLayer.direction] + speed > 5) {
    speed = speed * -1
  } else if (topLayer.threejs.position[topLayer.direction] + speed < -5 && speed < 0){
    speed = speed * -1
  }

  // 4 is the initial camera height
  if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
    camera.position.y += speed
  }

  if(perfect) {
    if (perfectObj.scale.x > 0) perfectObj.scale.x -= 0.01
    if (perfectObj.scale.z > 0) perfectObj.scale.z -= 0.01
  }

  updatePhysics();
  renderer.render(scene, camera);
}

function updatePhysics() {
  world.step(1 / 60);

  // Copy coordinates from CannonJS to ThreeJS
  overhangs.forEach((overhang) => {
    overhang.threejs.position.copy(overhang.cannonjs.position);
    overhang.threejs.quaternion.copy(overhang.cannonjs.quaternion);
  });
}

function showFeedback(msg) {
  feedback.innerHTML = msg;
  feedback.style.display = 'block';
  setTimeout(() => {
    feedback.style.display = 'none';
  }, 1000);
}

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "r":
      location.reload()
      break;
    default:
      break;
  }
})