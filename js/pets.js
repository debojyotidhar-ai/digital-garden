/* pets.js — a DOM spider hunts roaming Pokémon rendered with Three.js. */
(() => {
  'use strict';

  const isMobile = window.innerWidth < 768;

  if (document.querySelector('.garden-pets')) return;

  const CDN_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
  const visitors = [
    {
      name: 'Pikachu',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
      size: 0.92,
    },
    {
      name: 'Gengar',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/94.png',
      size: 1.08,
    },
    {
      name: 'Snorlax',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/143.png',
      size: 0.86,
    },
    {
      name: 'Mudkip',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/258.png',
      size: 0.9,
    },
    {
      name: 'Bulbasaur',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
      size: 0.92,
    },
    {
      name: 'Charmander',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png',
      size: 0.92,
    },
    {
      name: 'Squirtle',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png',
      size: 0.92,
    },
    {
      name: 'Eevee',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png',
      size: 0.92,
    },
    {
      name: 'Mew',
      texture: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/151.png',
      size: 0.92,
    },
  ];
  const visitorsToLoad = isMobile ? visitors.slice(0, 3) : visitors;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const container = document.createElement('div');
  container.className = 'garden-pets';
  container.setAttribute('aria-hidden', 'true');
  const spider = document.createElement('div');
  spider.className = 'garden-pets__spider';
  container.append(spider);
  document.body.append(container);

  const loadThree = () => import(CDN_URL);

  const loadTextures = (THREE) => {
    const loader = new THREE.TextureLoader();
    return Promise.all(visitorsToLoad.map(async (config) => {
      try {
        const texture = await loader.loadAsync(config.texture);
        return { ...config, texture };
      } catch (error) {
        console.error(`The ${config.name} sprite could not be loaded.`, error);
        return null;
      }
    })).then((companions) => companions.filter(Boolean));
  };

  const createCompanion = (THREE, config) => {
    const { texture } = config;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const scale = isMobile ? 0.5 : 1;
    sprite.scale.set(1.15 * config.size * scale, 1.5 * config.size * scale, 1);
    return sprite;
  };

  const start = (THREE, companions) => {
    if (!companions.length) {
      container.remove();
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'garden-pets__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.prepend(canvas);

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
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, window.innerWidth / window.innerHeight, 0.1, 80);
    camera.position.set(0, 0, 8.8);
    camera.lookAt(0, 0, 0);

    const worldHeightAt = (z) => {
      const distance = camera.position.z - z;
      return 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
    };
    const worldWidthAt = (z) => worldHeightAt(z) * camera.aspect;

    const models = companions.map((config, index) => {
      const model = createCompanion(THREE, config);
      const z = -index * 0.12;
      const margin = Math.max(Math.abs(model.scale.x), model.scale.y) / 2 + 0.08;
      const xBound = Math.max(0.1, worldWidthAt(z) / 2 - margin);
      const yBound = Math.max(0.1, worldHeightAt(z) / 2 - margin);
      const x = companions.length === 1
        ? 0
        : ((index / (companions.length - 1)) * 2 - 1) * xBound;
      const y = (Math.random() * 2 - 1) * yBound;
      const speed = 0.45 + Math.random() * 0.4;
      model.position.set(x, y, z);
      scene.add(model);
      return {
        model,
        x,
        y,
        z,
        vx: speed * (Math.random() < 0.5 ? -1 : 1),
        vy: (0.2 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1),
        behavior: 'walk',
        nextBehavior: performance.now() + 1800 + Math.random() * 3800,
        phase: Math.random() * Math.PI * 2,
      };
    });

    let spiderX = window.innerWidth / 2;
    let spiderY = window.innerHeight / 2;
    let hunterTarget = models[Math.floor(Math.random() * models.length)];
    let targetChangedAt = performance.now();
    let nextRetargetTime = targetChangedAt + 1000;
    const hunterLerp = 0.015;
    const greatestWorldSpan = models.reduce(
      (span, pet) => Math.max(span, worldWidthAt(pet.z), worldHeightAt(pet.z)),
      0
    );
    const escapeSpeed = Math.max(5.5, greatestWorldSpan * hunterLerp * 60 * 1.25);
    const dangerRadius = 2.4;
    spider.style.left = `${spiderX}px`;
    spider.style.top = `${spiderY}px`;

    const pointer = { ndcX: 0, ndcY: 0, active: false };
    let width = window.innerWidth;
    let height = window.innerHeight;
    let rafId = 0;
    let previousTime = 0;
    let running = !document.hidden && !reduceMotion.matches;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      spiderX = THREE.MathUtils.clamp(spiderX, 0, width);
      spiderY = THREE.MathUtils.clamp(spiderY, 0, height);
      models.forEach((pet) => {
        const margin = Math.max(Math.abs(pet.model.scale.x), pet.model.scale.y) / 2 + 0.08;
        const xBound = Math.max(0.1, worldWidthAt(pet.z) / 2 - margin);
        const yBound = Math.max(0.1, worldHeightAt(pet.z) / 2 - margin);
        pet.x = THREE.MathUtils.clamp(pet.x, -xBound, xBound);
        pet.y = THREE.MathUtils.clamp(pet.y, -yBound, yBound);
        pet.model.position.x = pet.x;
        pet.model.position.y = pet.y;
      });
      if (!running) renderer.render(scene, camera);
    };

    const projectPet = (pet) => {
      const position = pet.model.position.clone().project(camera);
      return {
        x: (position.x * 0.5 + 0.5) * width,
        y: (-position.y * 0.5 + 0.5) * height,
      };
    };

    const chooseHunterTarget = (time) => {
      const alternatives = models.length > 1
        ? models.filter((pet) => pet !== hunterTarget)
        : models;
      hunterTarget = alternatives[Math.floor(Math.random() * alternatives.length)];
      targetChangedAt = time;
      nextRetargetTime = time + 1000;
    };

    const updateHunter = (time, dt) => {
      if (!hunterTarget) return;

      spider.classList.add('is-active');
      const target = projectPet(hunterTarget);
      const dx = target.x - spiderX;
      const dy = target.y - spiderY;
      const distance = Math.hypot(dx, dy);
      const chaseRadius = Math.max(width, height) * 0.7;
      const escaped = time >= nextRetargetTime && distance > chaseRadius;

      if (time - targetChangedAt >= 5000 || escaped) {
        chooseHunterTarget(time);
        return;
      }

      const chaseFactor = 1 - Math.pow(1 - hunterLerp, dt * 60);
      spiderX += dx * chaseFactor;
      spiderY += dy * chaseFactor;
      spider.style.left = `${spiderX}px`;
      spider.style.top = `${spiderY}px`;
      spider.style.transform =
        `translate(-50%, -50%) rotate(${Math.atan2(dy, dx) * (180 / Math.PI) + 90}deg)`;
    };

    const onPointerMove = (event) => {
      pointer.ndcX = (event.clientX / Math.max(width, 1)) * 2 - 1;
      pointer.ndcY = 1 - (event.clientY / Math.max(height, 1)) * 2;
      pointer.active = true;
    };
    const clearPointer = () => { pointer.active = false; };

    const animate = (time) => {
      rafId = 0;
      if (!running || document.hidden) return;
      const dt = Math.min((time - (previousTime || time)) / 1000, 0.04);
      previousTime = time;

      models.forEach((pet, index) => {
        if (pet.behavior !== 'flee' && time >= pet.nextBehavior) {
          const roll = Math.random();
          pet.behavior = roll < 0.16 ? 'sleep' : roll < 0.31 ? 'bounce' : 'walk';
          pet.vx = Math.abs(pet.vx) * (Math.random() < 0.5 ? -1 : 1);
          pet.nextBehavior = time + 1800 + Math.random() * 4300;
        }

        const margin = Math.max(Math.abs(pet.model.scale.x), pet.model.scale.y) / 2 + 0.08;
        const xBound = Math.max(0.1, worldWidthAt(pet.z) / 2 - margin);
        const yBound = Math.max(0.1, worldHeightAt(pet.z) / 2 - margin);
        const spiderNdcX = (spiderX / Math.max(width, 1)) * 2 - 1;
        const spiderNdcY = 1 - (spiderY / Math.max(height, 1)) * 2;
        const hunterX = spiderNdcX * worldWidthAt(pet.model.position.z) / 2;
        const hunterY = spiderNdcY * worldHeightAt(pet.model.position.z) / 2;
        const awayX = pet.x - hunterX;
        const awayY = pet.y - hunterY;
        const hunterDistance = Math.hypot(awayX, awayY);

        if (hunterDistance < dangerRadius) {
          let escapeX = hunterDistance > 0.001 ? awayX / hunterDistance : (pet.vx < 0 ? 1 : -1);
          let escapeY = hunterDistance > 0.001 ? awayY / hunterDistance : 0;
          if (pet.x > xBound * 0.82 && escapeX > 0) escapeX = -Math.abs(escapeX);
          if (pet.x < -xBound * 0.82 && escapeX < 0) escapeX = Math.abs(escapeX);
          if (pet.y > yBound * 0.82 && escapeY > 0) escapeY = -Math.abs(escapeY);
          if (pet.y < -yBound * 0.82 && escapeY < 0) escapeY = Math.abs(escapeY);
          const escapeLength = Math.hypot(escapeX, escapeY) || 1;
          pet.vx = escapeX / escapeLength * escapeSpeed;
          pet.vy = escapeY / escapeLength * escapeSpeed;
          pet.behavior = 'flee';
          pet.nextBehavior = time + 500;
        } else if (pet.behavior === 'flee') {
          const speed = 0.45 + Math.random() * 0.4;
          pet.vx = speed * (Math.random() < 0.5 ? -1 : 1);
          pet.vy = (0.2 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1);
          pet.behavior = 'walk';
        }

        let flee = 0;
        if (pointer.active && pet.behavior !== 'sleep' && pet.behavior !== 'flee') {
          const pointerX = pointer.ndcX * worldWidthAt(0) / 2;
          const distance = pet.x - pointerX;
          if (Math.abs(distance) < 2.4) flee = Math.sign(distance || pet.vx) * (1 - Math.abs(distance) / 2.4);
        }

        const movementScale = pet.behavior === 'sleep' ? 0.2 : pet.behavior === 'bounce' ? 0.65 : 1;
        pet.x += (pet.vx * movementScale + flee * 2.6) * dt;
        pet.y += pet.vy * movementScale * dt;

        if (pet.x < -xBound || pet.x > xBound) {
          pet.x = THREE.MathUtils.clamp(pet.x, -xBound, xBound);
          pet.vx *= -1;
        }
        if (pet.y < -yBound || pet.y > yBound) {
          pet.y = THREE.MathUtils.clamp(pet.y, -yBound, yBound);
          pet.vy *= -1;
        }
        pet.model.position.x = pet.x;
        pet.model.position.y = pet.y + Math.sin(time * 0.004 + pet.phase) * (pet.behavior === 'sleep' ? 0.025 : 0.07);
        pet.model.position.z = pet.z + Math.sin(time * 0.0015 + index) * 0.12;
        pet.model.scale.x = Math.abs(pet.model.scale.x) * (pet.vx < 0 ? -1 : 1);
        pet.model.rotation.z = pet.behavior === 'sleep' ? Math.PI / 2 : Math.sin(time * 0.002 + pet.phase) * 0.035;
      });

      updateHunter(time, dt);
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
      spider.classList.toggle('is-active', running);
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

  loadThree().then((THREE) => loadTextures(THREE).then((companions) => start(THREE, companions))).catch((error) => {
    container.remove();
    console.error('The Pokémon sprites could not be loaded or initialized.', error);
  });
})();
