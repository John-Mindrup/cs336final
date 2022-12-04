function flag() {
  isFlag = true;
  wind = true;
  main();
  boundingBox = null;
  scene.remove(visibleTable);
  object.rotateX(3.1415926 / 2);

  gravity = new THREE.Vector3(0, 0, GRAVITY).multiplyScalar(MASS);
}
