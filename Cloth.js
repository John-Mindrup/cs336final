// vertex shader
const vshaderSource = `
attribute vec4 a_Position;
void main()
{
  // pass through so the value gets interpolated
  
  gl_Position = a_Position;
}
`;

// fragment shader
const fshaderSource = `
precision mediump float;
uniform sampler2D sampler;
void main()
{
  // sample from the texture at the interpolated texture coordinate,
  // and use the value directly as the surface color
  vec4 color = vec4(1, 0, 0 , 1);
  gl_FragColor = color;
}
`;

var vertices = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
]);

// A few global variables...

// the OpenGL context
var gl;

// handle to a buffer on the GPU
var vertexbuffer;

// handle to the compiled shader program on the GPU
var shader;
//cloth physics properties
var MASS = 0.1;
var DRAG = 0.97;

var wind = false;
var windStrength;
var windForce = new THREE.Vector3(0, 0, 0);
var tmpForce = new THREE.Vector3();

var GRAVITY = 9.81 * 140;
var gravity = new THREE.Vector3(0, -GRAVITY, 0).multiplyScalar(MASS);

var TIMESTEP = 18 / 1000;
var TIMESTEP_SQ = TIMESTEP * TIMESTEP;

var diff = new THREE.Vector3();

var camera, scene, renderer;
const canvas = document.getElementById("theCanvas");

//cloth size properties
var fabricLength = 400;
var restDistance;
var restDistanceB = 2;
var restDistanceS = Math.sqrt(2);
var xSegs = 35; // how many particles wide is the cloth
var ySegs = 35; // how many particles tall is the cloth

var itemSize = 40;
var boundingTable, visibleTable;
var a, b, c, d, e, f; // used for bounding box corrdinates
var posFriction = new THREE.Vector3(0, 0, 0);
var posNoFriction = new THREE.Vector3(0, 0, 0);
var friction = 0.9; // similar to coefficient of friction. 0 = frictionless, 1 = cloth sticks in place
//var clothInitialPosition = plane( 500, 500 );

var initialBlanketPos = Blanket(500, 500);
var blanket;
var cloth = new Cloth(xSegs, ySegs, fabricLength);
var boundingBox;
var isFlag;
var lastTime;
var mesh;

function Blanket(width, height) {
  return function (u, v) {
    var x = u * width - width / 2;
    var y = 150;
    var z = v * height - height / 2;
    return new THREE.Vector3(x, y, z);
  };
}

function Particle(x, y, z, m) {
  this.position = initialBlanketPos(x, y);
  this.previous = initialBlanketPos(x, y);
  this.original = initialBlanketPos(x, y);
  this.accel = new THREE.Vector3(0, 0, 0);
  this.mass = m;
  this.invMass = 1 / this.mass;
  this.tmp = new THREE.Vector3();
  this.tmp2 = new THREE.Vector3();
}

Particle.prototype.addForce = function (force) {
  this.accel.add(this.tmp2.copy(force).multiplyScalar(this.invMass));
};

Particle.prototype.integrate = function (timesq) {
  var newPos = this.tmp.subVectors(this.position, this.previous);
  newPos.multiplyScalar(DRAG).add(this.position);
  newPos.add(this.accel.multiplyScalar(timesq));
  this.tmp = this.previous;
  this.previous = this.position;
  this.position = newPos;
  this.accel.set(0, 0, 0);
};
Particle.prototype.lockToOriginal = function () {
  this.position.copy(this.original);
  this.previous.copy(this.original);
};

Particle.prototype.lock = function () {
  this.position.copy(this.previous);
  this.previous.copy(this.previous);
};

function satisifyConstrains(p1, p2, distance) {
  var spring = -2;
  var p1top2 = new THREE.Vector3();
  p1top2.subVectors(p2.position, p1.position);
  var p2top1 = new THREE.Vector3();
  p1top2.subVectors(p1.position, p2.position);
  
  var currentDist = p1top2.length();
  if (currentDist == 0) return; // prevents division by 0
  var compression = (currentDist - distance);
  p1.addForce(p1top2.multiplyScaler(spring*compression));
  p2.addForce(p2top1.multiplyScaler(spring*compression));
}

function restartCloth() {
  scene.remove(object);

  cloth = new Cloth(xSegs, ySegs, fabricLength);

  gravity = new THREE.Vector3(0, -GRAVITY, 0).multiplyScalar(MASS);

  // recreate cloth geometry
  blanket = new THREE.ParametricGeometry(initialBlanketPos, xSegs, ySegs);
  blanket.dynamic = true;

  // recreate cloth mesh
  object = new THREE.Mesh(blanket, clothMaterial);
  object.position.set(0, 0, 0);
  object.castShadow = true;

  scene.add(object); // adds the cloth to the scene
}

function createThing(thing) {
  if (thing == "Ball" || thing == "ball") {
    boundingTable.visible = false;
    visibleTable.visible = false;
    restartCloth();
  } else if (thing == "Table" || thing == "table") {
    // these variables are used in the table collision detection
    a = boundingBox.min.x;
    b = boundingBox.min.y;
    c = boundingBox.min.z;
    d = boundingBox.max.x;
    e = boundingBox.max.y;
    f = boundingBox.max.z;
    boundingTable.visible = true;
    visibleTable.visible = true;

    restartCloth();
  } else if (thing == "None" || thing == "none") {
    boundingTable.visible = false;
    visibleTable.visible = false;
  }
}

function simulate(time) {
  if (!lastTime) {
    lastTime = time;
    return;
  }

  // Aerodynamics forces
  if (wind) {
    windStrength = 100;
    windForce
      .set(-10, -10, 0)
      .normalize()
      .multiplyScalar(windStrength);

    // apply the wind force to the cloth particles
    var face,
      faces = blanket.faces,
      normal;
    particles = cloth.particles;
    for (i = 0, il = faces.length; i < il; i++) {
      face = faces[i];
      normal = face.normal;
      tmpForce.copy(normal).normalize().multiplyScalar(normal.dot(windForce));
      particles[face.a].addForce(tmpForce);
      particles[face.b].addForce(tmpForce);
      particles[face.c].addForce(tmpForce);
    }
  }

  var i, il, particles, particle, pt, constrains, constrain;
  (constrains = cloth.constrains), (il = constrains.length);
  for (i = 0; i < il; i++) {
    constrain = constrains[i];
    satisifyConstrains(constrain[0], constrain[1], constrain[2]);
  }
  for (particles = cloth.particles, i = 0, il = particles.length; i < il; i++) {
    particle = particles[i];
    particle.addForce(gravity);
    particle.integrate(TIMESTEP_SQ); // performs verlet integration
  }
  

  for (
    particles = cloth.particles, i = 0, il = particles.length;
    i < il && boundingBox != null;
    i++
  ) {
    particle = particles[i];
    whereAmI = particle.position;
    whereWasI = particle.previous;
    if (boundingBox.containsPoint(whereAmI)) {
      // if yes, we've collided, so take correcting action

      // no friction behavior:
      // place point at the nearest point on the surface of the cube
      currentX = whereAmI.x;
      currentY = whereAmI.y;
      currentZ = whereAmI.z;

      if (currentX <= (a + d) / 2) {
        nearestX = a;
      } else {
        nearestX = d;
      }

      if (currentY <= (b + e) / 2) {
        nearestY = b;
      } else {
        nearestY = e;
      }

      if (currentZ <= (c + f) / 2) {
        nearestZ = c;
      } else {
        nearestZ = f;
      }

      xDist = Math.abs(nearestX - currentX);
      yDist = Math.abs(nearestY - currentY);
      zDist = Math.abs(nearestZ - currentZ);

      posNoFriction.copy(whereAmI);

      if (zDist <= xDist && zDist <= yDist) {
        posNoFriction.z = nearestZ;
      } else if (yDist <= xDist && yDist <= zDist) {
        posNoFriction.y = nearestY;
      } else if (xDist <= yDist && xDist <= zDist) {
        posNoFriction.x = nearestX;
      }

      if (!boundingBox.containsPoint(whereWasI)) {
        // with friction behavior:
        // set particle to its previous position
        posFriction.copy(whereWasI);
        whereAmI.copy(
          posFriction
            .multiplyScalar(friction)
            .add(posNoFriction.multiplyScalar(1 - friction))
        );
      } else {
        whereAmI.copy(posNoFriction);
      }
    }
  }

  if (isFlag) {
    for (u = 0; u <= xSegs; u++) {
      particles[cloth.index(0, u)].lock();
    }
  }

  // cloth hits the floor
  for (particles = cloth.particles, i = 0, il = particles.length; i < il; i++) {
    particle = particles[i];
    pos = particle.position;
    if (pos.y < -249) {
      pos.y = -249;
    }
  }
}

function Cloth(w, h, l) {
  this.width = w;
  this.height = h;
  restDistance = l / w;

  var particles = [];
  var constrains = [];

  var u, v;

  // Create particles
  for (v = 0; v <= h; v++) {
    for (u = 0; u <= w; u++) {
      particles.push(new Particle(u / w, v / h, 0, MASS));
    }
  }

  for (v = 0; v <= h; v++) {
    for (u = 0; u <= w; u++) {
      if (v < h && (u == 0 || u == w)) {
        constrains.push([
          particles[index(u, v)],
          particles[index(u, v + 1)],
          restDistance,
        ]);
      }

      if (u < w && (v == 0 || v == h)) {
        constrains.push([
          particles[index(u, v)],
          particles[index(u + 1, v)],
          restDistance,
        ]);
      }
    }
  }

  //cross grain
  for (v = 0; v < h; v++) {
    for (u = 0; u < w; u++) {
      if (u != 0) {
        constrains.push([
          particles[index(u, v)],
          particles[index(u, v + 1)],
          restDistance,
        ]);
      }

      if (v != 0) {
        constrains.push([
          particles[index(u, v)],
          particles[index(u + 1, v)],
          restDistance,
        ]);
      }
    }
  }

  //drape effect
  for (v = 0; v < h; v++) {
    for (u = 0; u < w; u++) {
      if (v < h - 1) {
        constrains.push([
          particles[index(u, v)],
          particles[index(u, v + 2)],
          restDistanceB * restDistance,
        ]);
      }

      if (u < w - 1) {
        constrains.push([
          particles[index(u, v)],
          particles[index(u + 2, v)],
          restDistanceB * restDistance,
        ]);
      }
    }
  }

  //bias effect
  for (v = 0; v <= h; v++) {
    for (u = 0; u <= w; u++) {
      if (v < h && u < w) {
        constrains.push([
          particles[index(u, v)],
          particles[index(u + 1, v + 1)],
          restDistanceS * restDistance,
        ]);

        constrains.push([
          particles[index(u + 1, v)],
          particles[index(u, v + 1)],
          restDistanceS * restDistance,
        ]);
      }
    }
  }

  this.particles = particles;
  this.constrains = constrains;

  function index(u, v) {
    return u + v * (w + 1);
  }

  this.index = index;
}

function render() {
  var timer = Date.now() * 0.0002; // we're not using this for now - this is used for auto-rotation of camera

  // update position of the cloth
  // i.e. copy positions from the particles (i.e. result of physics simulation)
  // to the cloth geometry
  var p = cloth.particles;
  for (var i = 0, il = p.length; i < il; i++) {
    blanket.vertices[i].copy(p[i].position);
  }

  // recalculate cloth normals
  blanket.computeFaceNormals();
  blanket.computeVertexNormals();

  blanket.normalsNeedUpdate = true;
  blanket.verticesNeedUpdate = true;

  // TODO - change this to use table

  // // option to auto-rotate camera

  //var cameraRadius = Math.sqrt(
 //   camera.position.x * camera.position.x +
//      camera.position.z * camera.position.z
//  );
  //camera.position.x = Math.cos(timer) * cameraRadius;
  //camera.position.z = Math.sin(timer) * cameraRadius;

  camera.lookAt(scene.position);
  renderer.render(scene, camera); // render the scene
}

function main() {
  // Create scene, camera, & renderer
  scene = new THREE.Scene();
  // TODO - determine new color for this
  scene.fog = new THREE.Fog(0xcce0ff, 500, 10000);

  camera = new THREE.PerspectiveCamera(
    30,
    window.innerWidth / window.innerHeight,
    1,
    10000
  );
  camera.position.y = 450;
  camera.position.z = -1500;

  renderer = new THREE.WebGLRenderer();
  document.body.appendChild(renderer.domElement); // This adds a canvas to the page for us. For some reason it doesn't like when we pass in an existing canvas element (in WebGLRenderer constructor)
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(scene.fog.color);
  renderer.gammaInput = true;
  renderer.gammaOutput = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.renderSingleSided = false;

  // Create light & add it to the scene
  var light, materials;
  scene.add(new THREE.AmbientLight(0x666666));
  light = new THREE.DirectionalLight(0xdfebff, 1.75);
  light.position.set(50, 200, 100);
  light.position.multiplyScalar(1.3);
  light.castShadow = true;
  // light.shadowCameraVisible = true;
  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;

  var d = 300;
  light.shadow.camera.left = -d;
  light.shadow.camera.right = d;
  light.shadow.camera.top = d;
  light.shadow.camera.bottom = -d;
  light.shadow.camera.far = 1000;

  scene.add(light);

  // Create cloth & add it to the scene
  blanket = new THREE.ParametricGeometry(initialBlanketPos, xSegs, ySegs);
  blanket.dynamic = true;

  clothMaterial = new THREE.MeshPhongMaterial({
    color: 0x2929aa,
    specular: 0x030303,
    side: THREE.DoubleSide,
  });

  object = new THREE.Mesh(blanket, clothMaterial);
  object.position.set(0, 0, 0);
  object.receiveShadow = true;
  object.castShadow = true;

  scene.add(object);

  // add ground
  const groundMaterial = new THREE.MeshPhongMaterial({
    color: 0x111111, //0x3c3c3c,
    specular: 0x3c3c3c, //0x3c3c3c//,
    //map: groundTexture
  });
  mesh = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(20000, 20000),
    groundMaterial
  );
  mesh.position.y = -250;
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh); // add ground to scene

  // bounding item material (transparent)
  boundingItemMaterial = new THREE.MeshPhongMaterial({
    color: 0xaaaaaa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.01,
  });

  // visible item material - this is used for illusion :)
  visibleItemMaterial = new THREE.MeshPhongMaterial({
    color: 0x231709,
    side: THREE.DoubleSide,
  });

  // Create table
  var boxGeo = new THREE.BoxGeometry(250, 100, 250);
  boundingTable = new THREE.Mesh(boxGeo, boundingItemMaterial);
  boundingTable.position.x = 0;
  boundingTable.position.y = 0;
  boundingTable.position.z = 0;
  // don't show shadow of invisible box
  boundingTable.receiveShadow = false;
  boundingTable.castShadow = false;
  scene.add(boundingTable);

  var boxGeo = new THREE.BoxGeometry(200, 84, 200);
  visibleTable = new THREE.Mesh(boxGeo, visibleItemMaterial);
  visibleTable.position.x = 0;
  visibleTable.position.y = 0;
  visibleTable.position.z = 0;
  visibleTable.receiveShadow = false;
  visibleTable.castShadow = true; // need to add ground if want to see shadow
  scene.add(visibleTable);

  boundingTable.geometry.computeBoundingBox();
  boundingBox = boundingTable.geometry.boundingBox.clone();

  createThing("table");

  // define an animation loop
  var animate = function () {
    requestAnimationFrame(animate);

    var time = Date.now();

    simulate(time); // run physics simulation to create new positions of cloth
    render(); // update position of cloth, compute normals, rotate camera, render the scene
  };

  animate();
}

// Automatically resize the camera and renderer size given the browser changes window size
window.addEventListener(
  "resize",
  () => {
    console.log("in new event listener for window sizechange");

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  },
  false
);
