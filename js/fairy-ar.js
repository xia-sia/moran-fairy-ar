/**
 * 사월의 부귀, 개화 — AR 코어 v3
 * iOS Safari + Android Chrome 모두 지원
 */

const FAIRY_CONFIG = [
  { id: 0, name: '부귀', color: 0xE07A7A, spawnOffset: [-0.06,  0.04, 0.02] },
  { id: 1, name: '영화', color: 0xE0933A, spawnOffset: [ 0.00,  0.08, 0.02] },
  { id: 2, name: '사랑', color: 0xC8A96E, spawnOffset: [ 0.06,  0.02, 0.04] },
];

const WORLD_POSITIONS = [
  new THREE.Vector3(-1.5,  0.3, -3.0),
  new THREE.Vector3( 1.8,  0.6, -4.5),
  new THREE.Vector3( 0.2, -0.4, -3.8),
];

const PHASE = {
  PERMISSION: 'permission',
  LOADING:    'loading',
  SCANNING:   'scanning',
  DETECTED:   'detected',
  ESCAPING:   'escaping',
  HUNTING:    'hunting',
  COMPLETE:   'complete',
};

let currentPhase = PHASE.PERMISSION;
let mindarThree, renderer, scene, camera, anchor;
let fairyMeshes  = [];
let fairyCaught  = [false, false, false];
let gyroEnabled  = false;
let deviceQuat   = new THREE.Quaternion();
let clock        = new THREE.Clock();
const raycaster  = new THREE.Raycaster();

// ── 권한 버튼 ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-allow').addEventListener('click', requestPermissionsAndStart);
});

async function requestPermissionsAndStart() {
  setPhase(PHASE.LOADING);

  try {
    // 1) 카메라 권한 먼저 직접 요청 (iOS/Android 팝업 트리거)
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    // 권한 확인 후 스트림 즉시 해제 (MindAR이 다시 열음)
    stream.getTracks().forEach(t => t.stop());

    // 2) iOS 자이로 권한 (iOS 13+ 전용)
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') attachGyro();
      } catch (e) {
        // 자이로 거부돼도 AR은 계속 (자이로 없이 진행)
      }
    } else {
      // Android / 데스크탑: 자동 허용
      attachGyro();
    }

    // 3) MindAR 초기화
    await initAR();

  } catch (err) {
    let msg = '카메라 권한을 허용해주세요.';
    if (err.name === 'NotAllowedError')  msg = '카메라 접근이 거부됐어요.\n설정에서 카메라 권한을 허용해주세요.';
    if (err.name === 'NotFoundError')    msg = '카메라를 찾을 수 없어요.';
    if (err.name === 'NotSupportedError') msg = '이 브라우저는 카메라를 지원하지 않아요.\nSafari 또는 Chrome을 사용해주세요.';
    showError(msg);
  }
}

// ── AR 초기화 ────────────────────────────────────────────────────────────

async function initAR() {
  try {
    mindarThree = new window.MINDAR.IMAGE.MindARThree({
      container:      document.querySelector('#ar-container'),
      imageTargetSrc: './assets/targets/minhwa.mind',
      uiLoading:      'no',
      uiScanning:     'no',
      uiError:        'no',
    });

    renderer = mindarThree.renderer;
    scene    = mindarThree.scene;
    camera   = mindarThree.camera;

    // 조명
    scene.add(new THREE.AmbientLight(0xfff5ea, 1.2));
    const dir = new THREE.DirectionalLight(0xffeedd, 0.8);
    dir.position.set(1, 2, 1);
    scene.add(dir);

    // 앵커
    anchor = mindarThree.addAnchor(0);
    anchor.onTargetFound = onTargetFound;
    anchor.onTargetLost  = onTargetLost;

    // 요정 생성
    FAIRY_CONFIG.forEach((cfg) => {
      const fairy = createFairy(cfg);
      fairy.visible = false;
      fairy.position.set(...cfg.spawnOffset);
      anchor.group.add(fairy);
      fairyMeshes.push(fairy);
    });

    // 렌더 루프
    renderer.setAnimationLoop(onFrame);

    // MindAR 시작
    await mindarThree.start();

    // 터치/클릭
    renderer.domElement.addEventListener('touchstart', onTouch, { passive: false });
    renderer.domElement.addEventListener('mousedown',  onMouse);

    setPhase(PHASE.SCANNING);

  } catch (err) {
    showError(err.message || 'AR을 시작할 수 없어요.');
  }
}

// ── 요정 메시 ────────────────────────────────────────────────────────────

function createFairy(cfg) {
  const group = new THREE.Group();
  group.userData = { fairyId: cfg.id, caught: false, frozen: false };

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 16, 16),
    new THREE.MeshStandardMaterial({
      color: cfg.color, emissive: cfg.color,
      emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.1,
    })
  );
  group.add(body);
  group.userData.body = body;

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 12, 12),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.18, side: THREE.BackSide })
  );
  group.add(glow);
  group.userData.glow = glow;

  group.add(new THREE.PointLight(cfg.color, 0.5, 0.15));

  const count = 12;
  const pos   = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 0.028 + Math.random() * 0.010;
    pos[i*3]   = Math.cos(a) * r;
    pos[i*3+1] = (Math.random() - 0.5) * 0.015;
    pos[i*3+2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const petals = new THREE.Points(geo,
    new THREE.PointsMaterial({ color: cfg.color, size: 0.005, transparent: true, opacity: 0.7, sizeAttenuation: true })
  );
  group.add(petals);
  group.userData.petals = petals;

  return group;
}

// ── 앵커 이벤트 ──────────────────────────────────────────────────────────

function onTargetFound() {
  if (currentPhase !== PHASE.SCANNING) return;
  setPhase(PHASE.DETECTED);
  fairyMeshes.forEach((fairy, i) => {
    setTimeout(() => {
      fairy.visible = true;
      fairy.scale.set(0, 0, 0);
      animateScale(fairy, 0, 1, 600);
    }, i * 300 + 200);
  });
  setTimeout(startEscape, 2400);
}

function onTargetLost() {}

// ── 탈출 & 월드 전환 ─────────────────────────────────────────────────────

function startEscape() {
  setPhase(PHASE.ESCAPING);
  fairyMeshes.forEach((fairy, i) => {
    setTimeout(() => {
      const to = new THREE.Vector3(
        fairy.position.x + (Math.random() - 0.5) * 0.1,
        0.15 + i * 0.04,
        fairy.position.z + (Math.random() - 0.5) * 0.05
      );
      animatePosition(fairy, fairy.position.clone(), to, 800);
    }, i * 200);
  });
  setTimeout(switchToWorldMode, 1200);
}

function switchToWorldMode() {
  try { mindarThree.pause(false); } catch(e) {}
  fairyMeshes.forEach((fairy, i) => {
    const worldPos = new THREE.Vector3();
    fairy.getWorldPosition(worldPos);
    anchor.group.remove(fairy);
    scene.add(fairy);
    animatePosition(fairy, worldPos, WORLD_POSITIONS[i], 1200);
    fairy.visible = true;
  });
  gyroEnabled = true;
  setTimeout(() => setPhase(PHASE.HUNTING), 1400);
}

// ── 자이로 ────────────────────────────────────────────────────────────────

function attachGyro() {
  window.addEventListener('deviceorientation', (e) => {
    if (!gyroEnabled) return;
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(e.beta  || 0),
      THREE.MathUtils.degToRad(e.alpha || 0),
      THREE.MathUtils.degToRad(-(e.gamma || 0)),
      'YXZ'
    );
    deviceQuat.setFromEuler(euler);
  });
}

// ── 터치 포획 ─────────────────────────────────────────────────────────────

function onTouch(e) {
  e.preventDefault();
  const t = e.touches[0];
  checkCatch(
     (t.clientX / window.innerWidth)  * 2 - 1,
    -(t.clientY / window.innerHeight) * 2 + 1
  );
}
function onMouse(e) {
  checkCatch(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
}

function checkCatch(x, y) {
  if (currentPhase !== PHASE.HUNTING) return;
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const targets = fairyMeshes.filter(f => !f.userData.caught && f.visible).map(f => f.userData.body);
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length > 0) {
    const fairy = fairyMeshes.find(f => f.userData.body === hits[0].object);
    if (fairy) catchFairy(fairy, x, y);
  }
}

// ── 포획 연출 ─────────────────────────────────────────────────────────────

function catchFairy(fairy, nx, ny) {
  if (fairy.userData.caught) return;
  fairy.userData.caught = true;
  fairy.userData.frozen = true;
  const id = fairy.userData.fairyId;
  fairyCaught[id] = true;

  animateScale(fairy, 1, 1.4, 200, () =>
    animateScale(fairy, 1.4, 0, 300, () => { fairy.visible = false; })
  );
  spawnPetalBurst(fairy.position.clone(), FAIRY_CONFIG[id].color, 40);
  setTimeout(() => showCatchText(FAIRY_CONFIG[id].name, nx, ny, id), 220);
  setTimeout(() => document.getElementById(`dot-${id}`).classList.add('caught'), 400);
  setTimeout(() => {
    if (fairyCaught.every(Boolean)) setTimeout(showComplete, 1000);
  }, 3000);
}

// ── 꽃잎 파티클 ───────────────────────────────────────────────────────────

function spawnPetalBurst(position, color, count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3] = position.x; pos[i*3+1] = position.y; pos[i*3+2] = position.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.012, transparent: true, opacity: 1, sizeAttenuation: true });
  const burst = new THREE.Points(geo, mat);
  scene.add(burst);

  const vel = Array.from({ length: count }, () => new THREE.Vector3(
    (Math.random() - 0.5) * 0.04, Math.random() * 0.05, (Math.random() - 0.5) * 0.04
  ));
  let elapsed = 0;
  function step() {
    elapsed += 0.016;
    const p = burst.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      p[i*3]   += vel[i].x;
      p[i*3+1] += vel[i].y - elapsed * 0.02;
      p[i*3+2] += vel[i].z;
    }
    burst.geometry.attributes.position.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - elapsed / 1.2);
    if (elapsed < 1.2) requestAnimationFrame(step);
    else { scene.remove(burst); geo.dispose(); mat.dispose(); }
  }
  requestAnimationFrame(step);
}

// ── 텍스트 이펙트 ─────────────────────────────────────────────────────────

function showCatchText(word, nx, ny, id) {
  const el = document.createElement('div');
  el.className = `catch-text fairy-${id}`;
  el.textContent = word;
  el.style.left = ((nx + 1) / 2 * 100).toFixed(1) + '%';
  el.style.top  = ((-ny + 1) / 2 * 100).toFixed(1) + '%';
  document.getElementById('text-effect-layer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── 방향 힌트 ─────────────────────────────────────────────────────────────

function updateHints() {
  if (currentPhase !== PHASE.HUNTING) return;
  fairyMeshes.forEach((fairy, i) => {
    const hint = document.getElementById(`hint-${i}`);
    if (!hint || fairy.userData.caught || !fairy.visible) { hint?.classList.remove('visible'); return; }
    const pos = fairy.position.clone().project(camera);
    if (pos.x > -1 && pos.x < 1 && pos.y > -1 && pos.y < 1) {
      hint.classList.remove('visible');
    } else {
      hint.classList.add('visible');
      const angle = Math.atan2(-pos.y, pos.x);
      const hw = window.innerWidth / 2, hh = window.innerHeight / 2;
      hint.style.left = (Math.cos(angle) * (hw - 48) + hw) + 'px';
      hint.style.top  = (window.innerHeight - (Math.sin(angle) * (hh - 48) + hh)) + 'px';
      hint.querySelector('.hint-arrow').style.transform = `rotate(${THREE.MathUtils.radToDeg(angle) + 45}deg)`;
      hint.querySelector('.hint-dist').textContent = fairy.position.distanceTo(camera.position).toFixed(1) + 'm';
    }
  });
}

// ── 엔딩 ─────────────────────────────────────────────────────────────────

function showComplete() { setPhase(PHASE.COMPLETE); }

// ── 렌더 루프 ─────────────────────────────────────────────────────────────

function onFrame() {
  const t = clock.getElapsedTime();
  if (gyroEnabled && currentPhase === PHASE.HUNTING) {
    camera.quaternion.slerp(deviceQuat, 0.1);
  }
  fairyMeshes.forEach((fairy, i) => {
    if (!fairy.visible || fairy.userData.caught) return;
    if (!fairy.userData.frozen) {
      fairy.position.y += Math.sin(t * 1.2 + i * 2.1) * 0.0003;
      fairy.rotation.y += 0.012;
    }
    if (fairy.userData.glow) fairy.userData.glow.material.opacity = 0.12 + Math.sin(t * 2.5 + i) * 0.07;
    if (fairy.userData.petals) fairy.userData.petals.rotation.y += 0.02;
  });
  updateHints();
  renderer.render(scene, camera);
}

// ── 페이즈 & 에러 ─────────────────────────────────────────────────────────

function setPhase(phase) {
  currentPhase = phase;
  document.querySelectorAll('.ui-phase').forEach(el => el.classList.remove('active'));
  const map = {
    [PHASE.PERMISSION]: 'ui-permission',
    [PHASE.LOADING]:    'ui-loading',
    [PHASE.SCANNING]:   'ui-scanning',
    [PHASE.DETECTED]:   'ui-detected',
    [PHASE.HUNTING]:    'ui-hunting',
    [PHASE.COMPLETE]:   'ui-complete',
  };
  if (map[phase]) document.getElementById(map[phase])?.classList.add('active');
}

function showError(msg) {
  document.getElementById('error-detail').textContent = msg;
  document.querySelectorAll('.ui-phase').forEach(el => el.classList.remove('active'));
  document.getElementById('ui-error').classList.add('active');
}

// ── 트윈 ─────────────────────────────────────────────────────────────────

function animateScale(obj, from, to, ms, cb) {
  const start = performance.now();
  (function step(now) {
    const p = Math.min((now - start) / ms, 1);
    const s = from + (to - from) * easeOutBack(p);
    obj.scale.set(s, s, s);
    if (p < 1) requestAnimationFrame(step); else cb?.();
  })(performance.now());
}

function animatePosition(obj, from, to, ms, cb) {
  const start = performance.now();
  (function step(now) {
    const p = Math.min((now - start) / ms, 1);
    obj.position.lerpVectors(from, to, easeInOutCubic(p));
    if (p < 1) requestAnimationFrame(step); else cb?.();
  })(performance.now());
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t-1, 3) + c1 * Math.pow(t-1, 2);
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
}
