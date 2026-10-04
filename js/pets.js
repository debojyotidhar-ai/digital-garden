/* pets.js — original low-poly garden companions, rendered with Three.js. */
(() => {
  'use strict';

  if (document.querySelector('.garden-pets')) return;

  const CDN_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
  const visitors = [
    { name: 'Pip the sun-scout', color: 0xf6c84a, light: 0xffedac, size: 0.92, ears: 'pointed' },
    { name: 'Moss the nap-keeper', color: 0x74a987, light: 0xc4d7a1, size: 1.08, ears: 'round' },
    { name: 'Luma the cloud-kit', color: 0xb29add, light: 0xeee5ff, size: 0.86, ears: 'long' },
    { name: 'Bloop the tide-drop', color: 0x65bdd0, light: 0xd4f4f2, size: 0.9, ears: 'fins' },
  ];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const container = document.createElement('div');
  container.className = 'garden-pets';
  container.setAttribute('aria-hidden', 'true');
  document.body.append(container);

  const loadThree = () => import(CDN_URL);

  const makeMaterial = (THREE, color, options = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    flatShading: true,
    ...options,
  });

  const addMesh = (THREE, group, geometry, material, position, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const createCompanion = (THREE, config) => {
    const group = new THREE.Group();
    const bodyMaterial = makeMaterial(THREE, config.color);
    const lightMaterial = makeMaterial(THREE, config.light);
    const darkMaterial = makeMaterial(THREE, 0x292833, { roughness: 0.5 });
    const bodyGeo = new THREE.IcosahedronGeometry(0.48, 1);
    const headGeo = new THREE.IcosahedronGeometry(0.32, 1);
    const limbGeo = new THREE.IcosahedronGeometry(0.17, 0);
    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const coneGeo = new THREE.ConeGeometry(0.13, 0.42, 5);

    const body = addMesh(THREE, group, bodyGeo, bodyMaterial, [0, 0.43, 0], [0.92, 1.08, 0.76]);
    const head = addMesh(THREE, group, headGeo, bodyMaterial, [0, 0.91, 0.02], [1.02, 0.94, 0.9]);
    addMesh(THREE, group, new THREE.IcosahedronGeometry(0.2, 0), lightMaterial, [0, 0.42, 0.365], [1.15, 0.92, 0.38]);

    const eyeLeft = addMesh(THREE, group, eyeGeo, darkMaterial, [-0.12, 0.94, 0.302]);
    const eyeRight = addMesh(THREE, group, eyeGeo, darkMaterial, [0.12, 0.94, 0.302]);
    eyeLeft.castShadow = false;
    eyeRight.castShadow = false;

    const footLeft = addMesh(THREE, group, limbGeo, lightMaterial, [-0.24, 0.08, 0.11], [1.05, 0.68, 1.2]);
    const footRight = addMesh(THREE, group, limbGeo, lightMaterial, [0.24, 0.08, 0.11], [1.05, 0.68, 1.2]);

    const earPositions = config.ears === 'fins'
      ? [[-0.33, 0.94, 0], [0.33, 0.94, 0]]
      : [[-0.22, 1.15, 0], [0.22, 1.15, 0]];
    earPositions.forEach(([x, y, z], index) => {
      if (config.ears === 'round') {
        addMesh(THREE, group, new THREE.IcosahedronGeometry(0.18, 0), bodyMaterial, [x, y, z], [1, 0.9, 0.8]);
      } else {
        const ear = addMesh(THREE, group, coneGeo, bodyMaterial,
          [x, y, z], config.ears === 'long' ? [0.78, 1.55, 0.8] : [0.8, 0.95, 0.8]);
        ear.rotation.z = index === 0 ? 0.28 : -0.28;
        if (config.ears === 'fins') ear.rotation.z += index === 0 ? -0.9 : 0.9;
      }
    });

    const armLeft = addMesh(THREE, group, limbGeo, bodyMaterial, [-0.42, 0.42, 0], [0.7, 1.1, 0.72]);
    const armRight = addMesh(THREE, group, limbGeo, bodyMaterial, [0.42, 0.42, 0], [0.7, 1.1, 0.72]);
    armLeft.rotation.z = -0.4;
    armRight.rotation.z = 0.4;

    group.scale.setScalar(config.size);
    group.userData = { body, head, footLeft, footRight, armLeft, armRight };
    return group;
  };

  const start = (THREE) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'garden-pets__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.replaceChildren(canvas);

    if (!THREE.WebGLRenderer) {
      console.error('Three.js loaded, but WebGLRenderer is unavailable.');
      container.remove();
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, 180, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, window.innerWidth / 180, 0.1, 80);
    camera.position.set(0, 1.1, 8.8);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xc5d9ff, 0x253038, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffedcf, 2.6);
    keyLight.position.set(-3, 6, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(512, 512);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 30),
      new THREE.ShadowMaterial({ color: 0x18202b, opacity: 0.27 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.18;
    floor.receiveShadow = true;
    scene.add(floor);

    const models = visitors.map((config, index) => {
      const model = createCompanion(THREE, config);
      const spacing = Math.min(2.1, 12 / visitors.length);
      const direction = index % 2 === 0 ? 1 : -1;
      const x = (index - (visitors.length - 1) / 2) * spacing;
      model.position.set(x, -1.16, -index * 0.12);
      scene.add(model);
      return {
        model,
        x,
        z: model.position.z,
        direction,
        speed: 0.45 + Math.random() * 0.4,
        behavior: 'walk',
        nextBehavior: performance.now() + 1800 + Math.random() * 3800,
        phase: Math.random() * Math.PI * 2,
      };
    });

    const pointer = { x: 0, active: false };
    let width = window.innerWidth;
    let rafId = 0;
    let previousTime = 0;
    let running = !document.hidden && !reduceMotion.matches;

    const worldWidthAt = (z) => {
      const distance = camera.position.z - z;
      const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
      return viewHeight * camera.aspect;
    };

    const resize = () => {
      width = window.innerWidth;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, 180, false);
      camera.aspect = width / 180;
      camera.updateProjectionMatrix();
      models.forEach((pet) => {
        const bound = worldWidthAt(pet.z) / 2 - 0.55;
        pet.x = THREE.MathUtils.clamp(pet.x, -bound, bound);
      });
      if (!running) renderer.render(scene, camera);
    };

    const onPointerMove = (event) => {
      pointer.x = (event.clientX / Math.max(width, 1) - 0.5) * worldWidthAt(0);
      pointer.active = true;
    };
    const clearPointer = () => { pointer.active = false; };

    const animate = (time) => {
      rafId = 0;
      if (!running || document.hidden) return;
      const dt = Math.min((time - (previousTime || time)) / 1000, 0.04);
      previousTime = time;

      models.forEach((pet, index) => {
        const { body, head, footLeft, footRight, armLeft, armRight } = pet.model.userData;
        if (time >= pet.nextBehavior) {
          const roll = Math.random();
          pet.behavior = roll < 0.16 ? 'sleep' : roll < 0.31 ? 'bounce' : 'walk';
          pet.direction = Math.random() < 0.5 ? -1 : 1;
          pet.nextBehavior = time + 1800 + Math.random() * 4300;
        }

        let flee = 0;
        if (pointer.active && pet.behavior !== 'sleep') {
          const distance = pet.x - pointer.x;
          if (Math.abs(distance) < 2.4) flee = Math.sign(distance || pet.direction) * (1 - Math.abs(distance) / 2.4);
        }

        if (pet.behavior === 'walk') {
          pet.x += (pet.direction * pet.speed + flee * 2.6) * dt;
        } else if (pet.behavior === 'bounce') {
          pet.x += (pet.direction * pet.speed * 0.65 + flee * 2.6) * dt;
        }

        const bound = worldWidthAt(pet.z) / 2 - 0.55;
        if (pet.x < -bound || pet.x > bound) {
          pet.x = THREE.MathUtils.clamp(pet.x, -bound, bound);
          pet.direction *= -1;
        }
        pet.model.position.x = pet.x;
        pet.model.position.y = -1.16 + Math.sin(time * 0.004 + pet.phase) * (pet.behavior === 'sleep' ? 0.025 : 0.07);
        pet.model.position.z = pet.z + Math.sin(time * 0.0015 + index) * 0.12;
        pet.model.rotation.y = pet.direction < 0 ? Math.PI + 0.12 : 0.12;
        pet.model.rotation.z = pet.behavior === 'sleep' ? Math.PI / 2 : Math.sin(time * 0.002 + pet.phase) * 0.035;

        const step = Math.sin(time * 0.012 + pet.phase) * (pet.behavior === 'walk' ? 0.45 : 0.06);
        footLeft.rotation.x = step;
        footRight.rotation.x = -step;
        armLeft.rotation.z = -0.4 - step * 0.45;
        armRight.rotation.z = 0.4 + step * 0.45;
        body.rotation.z = pet.behavior === 'sleep' ? 0.05 : Math.sin(time * 0.005 + pet.phase) * 0.035;
        head.rotation.x = pet.behavior === 'bounce' ? Math.sin(time * 0.012) * 0.08 : 0;
      });

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    const stop = () => {
      running = false;
      previousTime = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      renderer.render(scene, camera);
    };
    const play = () => {
      running = !document.hidden && !reduceMotion.matches;
      previousTime = 0;
      if (running && !rafId) rafId = requestAnimationFrame(animate);
      else renderer.render(scene, camera);
    };

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('blur', clearPointer);
    document.addEventListener('visibilitychange', play);
    reduceMotion.addEventListener('change', play);
    if (running) rafId = requestAnimationFrame(animate);
    else renderer.render(scene, camera);
  };

  loadThree().then(start).catch((error) => {
    container.remove();
    console.error('The 3D garden companions could not be initialized.', error);
  });
})();
