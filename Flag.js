function flag() {
  isOnFlagPole = true;

  main();
  var cameraRadius = Math.sqrt(
  camera.position.x * camera.position.x +
      camera.position.z * camera.position.z
  );
  camera.position.x = Math.cos(-Math.PI/6) * cameraRadius;
  camera.position.z = Math.sin(-Math.PI/6) * cameraRadius;
 
  restartCloth();
  boundingBox = null;
  scene.remove(visibleTable);
  scene.remove(mesh);
  object.rotateX(3.1415926 / 2);

  gravity = new THREE.Vector3(0, 0, GRAVITY).multiplyScalar(MASS);

}

