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
-0.5, -0.5,
0.5, -0.5,
0.5, 0.5,
-0.5, -0.5,
0.5, 0.5,
-0.5, 0.5
]);

// A few global variables...

// the OpenGL context
var gl;

// handle to a buffer on the GPU
var vertexbuffer;

// handle to the compiled shader program on the GPU
var shader;
//cloth physics properties
var MASS = .1;
var DRAG = .97;

var GRAVITY = 9.81 * 140;
var gravity = new THREE.Vector3( 0, - GRAVITY, 0 ).multiplyScalar( MASS );

var TIMESTEP = 18 / 1000;
var TIMESTEP_SQ = TIMESTEP * TIMESTEP;

var diff = new THREE.Vector3();

var camera, scene, renderer;
const canvas = document.getElementById('theCanvas');

//cloth size properties
var fabricLength = 600;
var restDistance;
var restDistanceB = 2;
var restDistanceS = Math.sqrt(2);
var xSegs = 30; // how many particles wide is the cloth
var ySegs = 30; // how many particles tall is the cloth

var itemSize = 40;
var table;

var initialBlanketPos = Blanket(500, 500);
var blanket;
var cloth = new Cloth( xSegs, ySegs, fabricLength );

var lastTime;

function Blanket(width, height) {
    return function (u, v) {
        var x = u * width - width / 2;
        var y = 125;
        var z = v * height - height / 2;
        return new THREE.Vector3(x, y, z);
    }
}



function Particle(x, y, z, m)
{
    this.position = initialBlanketPos(x, y);
    this.previous = initialBlanketPos(x, y);
    this.original = initialBlanketPos(x, y);
    this.accel = new THREE.Vector3(0, 0, 0);
    this.mass = m;
    this.invMass = 1 / this.mass;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();

}

Particle.prototype.addForce = function(force)
{
    this.accel.add(
        this.tmp2.copy( force ).multiplyScalar( this.invMass )
      );
}

Particle.prototype.integrate = function (timesq) {
    var newPos = this.tmp.subVectors(this.position, this.previous);
    newPos.multiplyScalar(DRAG).add(this.position);
    newPos.add(this.accel.multiplyScalar(timesq));
    this.tmp = this.previous;
    this.previous = this.position;
    this.position = newPos;
    this.accel.set(0, 0, 0);
    

};

function satisifyConstrains(p1, p2, distance) {
    var diff = new THREE.Vector3();
    diff.subVectors(p2.position, p1.position);
    var currentDist = diff.length();
    if (currentDist == 0) return; // prevents division by 0
    var correction = diff.multiplyScalar((currentDist - distance) / currentDist);
    var correctionHalf = correction.multiplyScalar(0.5);
    p1.position.add(correctionHalf);
    p2.position.sub(correctionHalf);

}

function repelParticles( p1, p2, distance) {
    var diff = new THREE.Vector3();
    diff.subVectors(p2.position, p1.position);
    var currentDist = diff.length();
    if (currentDist == 0) return; // prevents division by 0
    if (currentDist < distance) {
        var correction = diff.multiplyScalar((currentDist - distance) / currentDist);
        var correctionHalf = correction.multiplyScalar(0.5);
        p1.position.add(correctionHalf);
        p2.position.sub(correctionHalf);

  }

}

function simulate(time)
{
    if ( ! lastTime ) {
        lastTime = time;
        return;
    }

    var i, il, particles, particle, pt, constrains, constrain;
    for ( particles = cloth.particles, i = 0, il = particles.length; i < il; i ++ )
    {
        particle = particles[ i ];
        particle.addForce( gravity );
        particle.integrate( TIMESTEP_SQ ); // performs verlet integration
    }
    constrains = cloth.constrains,
    il = constrains.length;
    for ( i = 0; i < il; i ++ ) {
        constrain = constrains[ i ];
        satisifyConstrains( constrain[ 0 ], constrain[ 1 ], constrain[ 2 ], constrain[ 3] );
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
            particles.push(
                new Particle(u / w, v / h, 0, MASS)
            );
        }
    }

    for (v = 0; v <= h; v++) {
        for (u = 0; u <= w; u++) {

            if (v < h && (u == 0 || u == w)) {
                constrains.push([
                    particles[index(u, v)],
                    particles[index(u, v + 1)],
                    restDistance
                ]);
            }

            if (u < w && (v == 0 || v == h)) {
                constrains.push([
                    particles[index(u, v)],
                    particles[index(u + 1, v)],
                    restDistance
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
                    restDistance
                ]);
            }

            if (v != 0) {
                constrains.push([
                    particles[index(u, v)],
                    particles[index(u + 1, v)],
                    restDistance
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
                    restDistanceB * restDistance
                ]);
            }

            if (u < w - 1) {
                constrains.push([
                    particles[index(u, v)],
                    particles[index(u + 2, v)],
                    restDistanceB * restDistance
                ]);
            }


        }
    }

     this.particles = particles;
     this.constrains = constrains;

    function index( u, v ) {

      return u + v * ( w + 1 );

     }

    this.index = index;

}


function render() {

	// var timer = Date.now() * 0.0002; // we're not using this for now - this is used for auto-rotation of camera


	// update position of the cloth
	// i.e. copy positions from the particles (i.e. result of physics simulation)
	// to the cloth geometry
	var p = cloth.particles;
	for ( var i = 0, il = p.length; i < il; i ++ ) {
		blanket.vertices[ i ].copy( p[ i ].position );
	}

	// recalculate cloth normals
	blanket.computeFaceNormals();
	blanket.computeVertexNormals();

	blanket.normalsNeedUpdate = true;
	blanket.verticesNeedUpdate = true;

    // TODO - change this to use table
	// // update sphere position from ball position
	// sphere.position.copy( ballPosition );

	// // option to auto-rotate camera
	// if ( rotate ) {
	// 	var cameraRadius = Math.sqrt(camera.position.x*camera.position.x + camera.position.z*camera.position.z);
	// 	camera.position.x = Math.cos( timer ) * cameraRadius;
	// 	camera.position.z = Math.sin( timer ) * cameraRadius;
	// }

	camera.lookAt( scene.position );
	renderer.render( scene, camera ); // render the scene
}


function main()
{
    // Create scene, camera, & renderer
    scene = new THREE.Scene();
    // TODO - determine new color for this
    scene.fog = new THREE.Fog( 0xD3D3D3, 500, 10000 );

    camera = new THREE.PerspectiveCamera( 30, window.innerWidth / window.innerHeight, 1, 10000 );
	camera.position.y = 450;
	camera.position.z = 1500;

    renderer = new THREE.WebGLRenderer();
    document.body.appendChild( renderer.domElement ); // This adds a canvas to the page for us. For some reason it doesn't like when we pass in an existing canvas element (in WebGLRenderer constructor)
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setClearColor( scene.fog.color );
	renderer.gammaInput = true;
	renderer.gammaOutput = true;
	renderer.shadowMap.enabled = true;


    // Create light & add it to the scene
    var light, materials;
	scene.add( new THREE.AmbientLight( 0xFFFFFF ) );
	light = new THREE.DirectionalLight( 0x000000, 1.75 );
	light.position.set( 50, 200, 100 );
	light.position.multiplyScalar( 1.3 );
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

	scene.add( light );

    
    // Create cloth & add it to the scene
    // clothGeometry = new THREE.ParametricGeometry(initialBlanketPos, xSegs, ySegs );
    blanket = new THREE.ParametricGeometry(initialBlanketPos, xSegs, ySegs);
    var verts = blanket.vertices;
    blanket.dynamic = true;

    clothMaterial = new THREE.MeshPhongMaterial( {
        color: 0xaa2929,
        specular: 0x030303,
        wireframeLinewidth: 2,
        //map: clothTexture,
        side: THREE.DoubleSide,
        alphaTest: 0.5
    } );

    object = new THREE.Mesh( blanket, clothMaterial );
	object.position.set( 0, 0, 0 );

    scene.add( object );



    var itemGeo = new THREE.SphereGeometry( itemSize, 20, 20 );
	// sphere material
	itemMaterial = new THREE.MeshPhongMaterial( {
		color: 0xaaaaaa,
		side: THREE.DoubleSide,
		transparent: false, 
		opacity:0.01
	} );
	// sphere mesh
	sphere = new THREE.Mesh( itemGeo, itemMaterial );
	sphere.castShadow = true;
	sphere.receiveShadow = true;
	scene.add( sphere ); // add sphere to scene

    // Create table
	var boxGeo = new THREE.BoxGeometry( 250, 100, 250 );
    table = new THREE.Mesh( itemGeo, itemMaterial );
    table.position.x = 0;
    table.position.y = 0;
    table.position.z = 0;
    table.receiveShadow = true;
    table.castShadow = true;
    scene.add( table );

  // get graphics context using its id
//   gl = getGraphicsContext("theCanvas");

  // load and compile the shader pair
//   shader = createShaderProgram(gl, vshaderSource, fshaderSource);

  // load the vertex data into GPU memory
  //vertexbuffer = createAndLoadBuffer(blanket.vertices);

  // specify a fill color for clearing the framebuffer
  //gl.clearColor(0.0, 0.8, 0.8, 1.0);


  // define an animation loop
  var animate = function() {
	requestAnimationFrame( animate );

	var time = Date.now();

	simulate(time); // run physics simulation to create new positions of cloth
	render(); 		// update position of cloth, compute normals, rotate camera, render the scene
  };

  animate();
}

// Automatically resize the camera and renderer size given the browser changes window size
window.addEventListener( 'resize', () => {
    console.log('in new event listener for window sizechange');

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );

}, false );