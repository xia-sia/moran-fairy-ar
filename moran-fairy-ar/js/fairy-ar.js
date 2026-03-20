/**
 * 사월의 부귀, 개화 — AR 코어
 *
 * Phase 흐름:
 *   SCANNING  → 민화 인식 대기
 *   DETECTED  → 요정 소환 연출 (MindAR 앵커)
 *   ESCAPING  → 요정 날아오름, 월드 공간으로 전환
 *   HUNTING   → 자이로스코프 모드, 요정 탐색
 *   COMPLETE  → 엔딩
 */

// ── 설정 ──────────────────────────────────────────────────────────────────

const FAIRY_CONFIG = [
  { id: 0, name: '부귀', color: 0xE07A7A, glowColor: '#E07A7A', petalsColor: '#E07A7A', spawnOffset: [-0.06, 0.04, 0.02] },
  { id: 1, name: '영화', color: 0xE0933A, glowColor: '#E0933A', petalsColor: '#E0933A', spawnOffset: [0.00, 0.08, 0.02]  },
  { id: 2, name: '사랑', color: 0xC8A96E, glowColor: '#C8A96E', petalsColor: '#C8A96E', spawnOffset: [0.06, 0.02, 0.04]  },
];

const PHASE = {
  SCANNING: 'scanning',
  DETECTED: 'detected',
  ESCAPING: 'escaping',
  HUNTING:  'hunting',
  COMPLETE: 'complete',
};

// 요정 월드 좌표 (자이로 모드 진입 시 배치될 위치)
// x: 좌우, y: 상하, z: 앞뒤 (음수 = 앞)
const WORLD_POSITIONS = [
  new THREE.Vector3(-1.5,  0.3, -3.0),
  new THREE.Vector3( 1.8,  0.6, -4.5),
  new THREE.Vector3( 0.2, -0.4, -3.8),
];

// ── 상태 ──────────────────────────────────────────────────────────────────

let currentPhase = PHASE.SCANNING;
let mindarThree, renderer, scene, camera;
let anchor;
let fairyMeshes = [];
let fairyCaught = [false, false, false];
let deviceQuat = new THREE.Quaternion();
let gyroEnabled = false;
let clock = new THREE.Clock();

// ── MindAR 초기화 ─────────────────────────────────────────────────────────

async function init() {
  const THREE = window.THREE;

  mindarThree = new window.MINDAR.IMAGE.MindARThree({
    container:        document.querySelector('#ar-container'),
    imageTargetSrc:   './assets/targets/minhwa.mind',
    uiLoading:        'no',
    uiScanning:       'no',
    uiError:          'no',
  });

  ({ renderer, scene, camera } = mindarThree);

  // 조명
  const ambient = new THREE.AmbientLight(0xfff5ea, 1.2);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
  dirLight.position.set(1, 2, 1);
  scene.add(dirLight);

  // 앵커 (민화 이미지 타겟 0번)
  anchor = mindarThree.addAnchor(0);

  // 요정 생성 (초기에는 invisible)
  FAIRY_CONFIG.forEach((cfg, i) => {
    const fairy = createFairy(cfg);
    fairy.visible = false;
    fairy.position.set(...cfg.spawnOffset);
    anchor.group.add(fairy);
    fairyMeshes.push(fairy);
  });

  // 앵커 이벤트
  anchor.onTargetFound = onTargetFound;
  anchor.onTargetLost  = onTargetLost;

  // 렌더 루프
  renderer.setAnimationLoop(onFrame);

  // MindAR 시작
  await mindarThree.start();

  // 터치 이벤트
  renderer.domElement.addEventListener('touchstart', onTouch, { passive: false });
  renderer.domElement.addEventListener('mousedown', onMouse);

  // 자이로스코프
  requestGyroscope();
}

// ── 요정 메시 생성 (임시 geometry — 실제 GLTF로 교체 예정) ─────────────────

function createFairy(cfg) {
  const group = new THREE.Group();
  group.userData = { fairyId: cfg.id, caught: false };

  // 몸체 — 구체
  const bodyGeo = new THREE.SphereGeometry(0.018, 16, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    emissive: cfg.color,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // 빛 후광 — 큰 반투명 구체
  const glowGeo = new THREE.SphereGeometry(0.032, 12, 12);
  const glowMat = new THREE.MeshBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  group.add(glow);

  // 포인트 라이트 (요정 주변 빛)
  const light = new THREE.PointLight(cfg.color, 0.5, 0.15);
  group.add(light);

  // 꽃잎 파티클 (궤도)
  const petalCount = 12;
  const petalGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(petalCount * 3);
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const r = 0.028 + Math.random() * 0.010;
    positions[i * 3]     = Math.cos(angle) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.015;
    positions[i * 3 + 2] = Math.sin(angle) * r;
  }
  petalGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const petalMat = new THREE.PointsMaterial({
    color: cfg.color,
    size: 0.005,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
  });
  const petals = new THREE.Points(petalGeo, petalMat);
  group.add(petals);
  group.userData.petals = petals;
  group.userData.body   = body;
  group.userData.glow   = glow;

  return group;
}

// ── 앵커 이벤트 ──────────────────────────────────────────────────────────

function onTargetFound() {
  if (currentPhase !== PHASE.SCANNING) return;
  setPhase(PHASE.DETECTED);

  // 요정 등장 (순차 딜레이)
  fairyMeshes.forEach((fairy, i) => {
    setTimeout(() => {
      fairy.visible = true;
      fairy.scale.set(0, 0, 0);
      animateScale(fairy, 0, 1, 600);
    }, i * 300 + 200);
  });

  // 2초 후 탈출 시작
  setTimeout(startEscape, 2400);
}

function onTargetLost() {
  // 탈출 전이면 무시 (일시적 트래킹 끊김)
}

// ── 탈출 & 월드 전환 ─────────────────────────────────────────────────────

function startEscape() {
  setPhase(PHASE.ESCAPING);

  // 요정들 위로 날아오르는 애니 (앵커 기준)
  fairyMeshes.forEach((fairy, i) => {
    const delay = i * 200;
    setTimeout(() => {
      const targetY = 0.15 + i * 0.04;
      animatePosition(fairy, fairy.position.clone(), new THREE.Vector3(
        fairy.position.x + (Math.random() - 0.5) * 0.1,
        targetY,
        fairy.position.z + (Math.random() - 0.5) * 0.05
      ), 800);
    }, delay);
  });

  // 1.2초 후 월드 모드로 전환
  setTimeout(switchToWorldMode, 1200);
}

function switchToWorldMode() {
  // MindAR 일시정지 (카메라 피드 유지, 트래킹 중단)
  mindarThree.pause(false); // false = 카메라는 유지

  // 요정들을 앵커에서 분리 → scene에 직접 추가
  fairyMeshes.forEach((fairy, i) => {
    // 앵커의 월드 변환 적용
    const worldPos = new THREE.Vector3();
    fairy.getWorldPosition(worldPos);

    anchor.group.remove(fairy);
    scene.add(fairy);

    // 목표 월드 위치로 이동 애니
    animatePosition(fairy, worldPos, WORLD_POSITIONS[i], 1200);
    fairy.visible = true;
  });

  // 자이로 모드 활성화
  gyroEnabled = true;

  setTimeout(() => setPhase(PHASE.HUNTING), 1400);
}

// ── 자이로스코프 ─────────────────────────────────────────────────────────

function requestGyroscope() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+
    document.body.addEventListener('click', async () => {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm === 'granted') attachGyro();
    }, { once: true });
  } else {
    attachGyro();
  }
}

function attachGyro() {
  window.addEventListener('deviceorientation', (e) => {
    if (!gyroEnabled) return;
    const alpha = THREE.MathUtils.degToRad(e.alpha || 0);
    const beta  = THREE.MathUtils.degToRad(e.beta  || 0);
    const gamma = THREE.MathUtils.degToRad(e.gamma || 0);
    const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
    deviceQuat.setFromEuler(euler);
  });
}

// ── 터치 / 클릭 포획 판정 ───────────────────────────────────────────────

const raycaster = new THREE.Raycaster();

function onTouch(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const x = (touch.clientX / window.innerWidth)  * 2 - 1;
  const y = -(touch.clientY / window.innerHeight) * 2 + 1;
  checkCatch(x, y);
}

function onMouse(e) {
  const x = (e.clientX / window.innerWidth)  * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;
  checkCatch(x, y);
}

function checkCatch(x, y) {
  if (currentPhase !== PHASE.HUNTING) return;

  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

  // 잡힐 수 있는 요정 메시만 체크
  const catchable = fairyMeshes
    .filter(f => !f.userData.caught && f.visible)
    .map(f => f.userData.body);

  const hits = raycaster.intersectObjects(catchable, false);

  if (hits.length > 0) {
    // 히트된 body의 부모 group 찾기
    const hitBody = hits[0].object;
    const fairy = fairyMeshes.find(f => f.userData.body === hitBody);
    if (fairy) catchFairy(fairy, x, y);
  }
}

// ── 포획 연출 ─────────────────────────────────────────────────────────────

function catchFairy(fairy, nx, ny) {
  if (fairy.userData.caught) return;
  fairy.userData.caught = true;

  const id = fairy.userData.fairyId;
  fairyCaught[id] = true;

  const cfg = FAIRY_CONFIG[id];

  // 요정 정지 + 스케일 업 후 사라짐
  fairy.userData.frozen = true;
  animateScale(fairy, 1, 1.4, 200, () => {
    animateScale(fairy, 1.4, 0, 300, () => {
      fairy.visible = false;
    });
  });

  // 꽃잎 파티클 폭발
  spawnPetalBurst(fairy.position.clone(), cfg.color, 40);

  // 220ms 후 한글 텍스트 등장
  setTimeout(() => showCatchText(cfg.name, nx, ny, id), 220);

  // 카운터 점 채우기
  setTimeout(() => {
    document.getElementById(`dot-${id}`).classList.add('caught');
  }, 400);

  // 전부 잡았는지 확인
  setTimeout(() => {
    if (fairyCaught.every(Boolean)) {
      setTimeout(showComplete, 1000);
    }
  }, 3000);
}

// ── 꽃잎 파티클 폭발 ─────────────────────────────────────────────────────

function spawnPetalBurst(position, color, count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = position.x;
    pos[i * 3 + 1] = position.y;
    pos[i * 3 + 2] = position.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color,
    size: 0.012,
    transparent: true,
    opacity: 1,
    sizeAttenuation: true,
  });

  const burst = new THREE.Points(geo, mat);
  scene.add(burst);

  // 파티클 속도 저장
  const velocities = Array.from({ length: count }, () => new THREE.Vector3(
    (Math.random() - 0.5) * 0.04,
    Math.random() * 0.05,
    (Math.random() - 0.5) * 0.04,
  ));

  let elapsed = 0;
  function animateBurst() {
    elapsed += 0.016;
    const positions = burst.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      positions[i * 3]     += velocities[i].x;
      positions[i * 3 + 1] += velocities[i].y - elapsed * 0.02;
      positions[i * 3 + 2] += velocities[i].z;
    }
    burst.geometry.attributes.position.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - elapsed / 1.2);

    if (elapsed < 1.2) {
      requestAnimationFrame(animateBurst);
    } else {
      scene.remove(burst);
      geo.dispose(); mat.dispose();
    }
  }
  requestAnimationFrame(animateBurst);
}

// ── 텍스트 이펙트 ─────────────────────────────────────────────────────────

function showCatchText(word, nx, ny) {
  // nx, ny 는 NDC (-1~1) → 화면 퍼센트로 변환
  const sx = ((nx + 1) / 2 * 100).toFixed(1) + '%';
  const sy = ((-ny + 1) / 2 * 100).toFixed(1) + '%';

  const fairyId = FAIRY_CONFIG.findIndex(c => c.name === word);

  const el = document.createElement('div');
  el.className = `catch-text fairy-${fairyId}`;
  el.textContent = word;
  el.style.left = sx;
  el.style.top  = sy;

  document.getElementById('text-effect-layer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── 방향 힌트 업데이트 ───────────────────────────────────────────────────

function updateHints() {
  if (currentPhase !== PHASE.HUNTING) return;

  fairyMeshes.forEach((fairy, i) => {
    const hint = document.getElementById(`hint-${i}`);
    if (!hint || fairy.userData.caught || !fairy.visible) {
      hint && hint.classList.remove('visible');
      return;
    }

    // 스크린 좌표 계산
    const pos3d = fairy.position.clone().project(camera);
    const inScreen = (pos3d.x > -1 && pos3d.x < 1 && pos3d.y > -1 && pos3d.y < 1);

    if (inScreen) {
      hint.classList.remove('visible');
    } else {
      hint.classList.add('visible');
      // 화면 가장자리 위치 계산
      const angle = Math.atan2(-pos3d.y, pos3d.x);
      const margin = 48;
      const hw = window.innerWidth  / 2;
      const hh = window.innerHeight / 2;
      const ex = Math.cos(angle) * (hw - margin) + hw;
      const ey = Math.sin(angle) * (hh - margin) + hh; // Note: y flipped
      hint.style.left = ex + 'px';
      hint.style.top  = (window.innerHeight - ey) + 'px';

      // 화살표 방향
      const deg = THREE.MathUtils.radToDeg(angle);
      hint.querySelector('.hint-arrow').style.transform = `rotate(${deg + 45}deg)`;

      // 거리 표시
      const dist = fairy.position.distanceTo(camera.position);
      hint.querySelector('.hint-dist').textContent = dist.toFixed(1) + 'm';
    }
  });
}

// ── 엔딩 ─────────────────────────────────────────────────────────────────

function showComplete() {
  setPhase(PHASE.COMPLETE);
}

// ── 렌더 루프 ─────────────────────────────────────────────────────────────

function onFrame(time) {
  const delta = clock.getDelta();
  const t = clock.getElapsedTime();

  // 자이로 카메라 회전 (HUNTING 모드)
  if (gyroEnabled && currentPhase === PHASE.HUNTING) {
    camera.quaternion.slerp(deviceQuat, 0.1);
  }

  // 요정 애니메이션 (부유 + 회전)
  fairyMeshes.forEach((fairy, i) => {
    if (!fairy.visible || fairy.userData.caught) return;

    // 부유
    if (!fairy.userData.frozen) {
      fairy.position.y += Math.sin(t * 1.2 + i * 2.1) * 0.0003;
      fairy.rotation.y += 0.012;
    }

    // 후광 펄스
    if (fairy.userData.glow) {
      fairy.userData.glow.material.opacity = 0.12 + Math.sin(t * 2.5 + i) * 0.07;
    }

    // 파티클 궤도 회전
    if (fairy.userData.petals) {
      fairy.userData.petals.rotation.y += 0.02;
    }
  });

  // 방향 힌트 갱신
  updateHints();

  // MindAR 렌더
  renderer.render(scene, camera);
}

// ── 페이즈 전환 ──────────────────────────────────────────────────────────

function setPhase(phase) {
  currentPhase = phase;
  document.querySelectorAll('.ui-phase').forEach(el => el.classList.remove('active'));
  const map = {
    [PHASE.SCANNING]:  'ui-scanning',
    [PHASE.DETECTED]:  'ui-detected',
    [PHASE.HUNTING]:   'ui-hunting',
    [PHASE.COMPLETE]:  'ui-complete',
  };
  if (map[phase]) {
    document.getElementById(map[phase])?.classList.add('active');
  }
}

// ── 유틸: 트윈 애니 ──────────────────────────────────────────────────────

function animateScale(obj, from, to, durationMs, onComplete) {
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / durationMs, 1);
    const s = from + (to - from) * easeOutBack(p);
    obj.scale.set(s, s, s);
    if (p < 1) requestAnimationFrame(step);
    else if (onComplete) onComplete();
  }
  requestAnimationFrame(step);
}

function animatePosition(obj, from, to, durationMs, onComplete) {
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / durationMs, 1);
    const e = easeInOutCubic(p);
    obj.position.set(
      from.x + (to.x - from.x) * e,
      from.y + (to.y - from.y) * e,
      from.z + (to.z - from.z) * e,
    );
    if (p < 1) requestAnimationFrame(step);
    else if (onComplete) onComplete();
  }
  requestAnimationFrame(step);
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── 시작 ─────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', init);
