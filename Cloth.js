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

//cloth size properties
var fabricLength = 600;
var restDistance;
var restDistanceB = 2;
var restDistanceS = Math.sqrt(2);

var initialBlanketPos = Blanket(500, 500);
var blanket;

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
    this.tmp2.copy(force).multiplyScaler(this.invMass)
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
    var diff;
    diff.subVectors(p2.position, p1.position);
    var currentDist = diff.length();
    if (currentDist == 0) return; // prevents division by 0
    var correction = diff.multiplyScalar((currentDist - distance) / currentDist);
    var correctionHalf = correction.multiplyScalar(0.5);
    p1.position.add(correctionHalf);
    p2.position.sub(correctionHalf);

}

function repelParticles( p1, p2, distance) {
    var diff;
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

function Cloth(width, height, length) {
    this.width = width;
    this.height = height;
    restDistance = length / width;

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

}

function draw()
{
    // clear the framebuffer
  gl.clear(gl.COLOR_BUFFER_BIT);

  // bind the shader
  gl.useProgram(shader);

  // bind the vertex buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexbuffer);

  // get the index for the a_Position attribute defined in the vertex shader
  var positionIndex = gl.getAttribLocation(shader, 'a_Position');
  if (positionIndex < 0) {
    console.log('Failed to get the storage location of a_Position');
    return;
  }

  // "enable" the a_position attribute
  gl.enableVertexAttribArray(positionIndex);

  // associate the data in the currently bound buffer with the a_position attribute
  // (The '2' specifies there are 2 floats per vertex in the buffer.  Don't worry about
  // the last three args just yet.)
  gl.vertexAttribPointer(positionIndex, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // unbind shader and "disable" the attribute indices
  // (not really necessary when there is only one shader)
  gl.disableVertexAttribArray(positionIndex);
  gl.useProgram(null);
}

function main()
{
    // key handler
  //window.onkeypress = handleKeyPress;

  // get graphics context using its id
  gl = getGraphicsContext("theCanvas");

  // load and compile the shader pair
  shader = createShaderProgram(gl, vshaderSource, fshaderSource);

  // load the vertex data into GPU memory
  vertexbuffer = createAndLoadBuffer(vertices);

  // specify a fill color for clearing the framebuffer
  gl.clearColor(0.0, 0.8, 0.8, 1.0);

    blanket = THREE.PlaneGeometry(500, 500, xSegs, ySegs);
  // define an animation loop
  var animate = function() {
	draw();

	// request that the browser calls animate() again "as soon as it can"
    requestAnimationFrame(animate);
  };

  // start drawing!
  animate();
}
