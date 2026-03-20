/**
 * 사월의 부귀, 개화 — AR v5 (단순화)
 */

// ── 설정 ──────────────────────────────────────────────────────────────────

const FAIRIES = [
  { id: 0, name: '부귀', color: 0xE07A7A, pos: [-0.06, 0.04, 0.02] },
  { id: 1, name: '영화', color: 0xE0933A, pos: [ 0.00, 0.08, 0.02] },
  { id: 2, name: '사랑', color: 0xC8A96E, pos: [ 0.06, 0.02, 0.04] },
];

const WORLD_POS = [
  new THREE.Vector3(-1.5,  0.3, -3.0),
  new THREE.Vector3( 1.8,  0.6, -4.5),
  new THREE.Vector3( 0.2, -0.4, -3.8),
];

// ── 상태 ──────────────────────────────────────────────────────────────────

let mindarThree, renderer, scene, camera, anchor;
let meshes  = [];
let caught  = [false, false, false];
let hunting = false;
let gyroQ   = new THREE.Quaternion();
let clock   = new THREE.Clock();
const ray   = new THREE.Raycaster();

// ── 시작 버튼 ─────────────────────────────────────────────────────────────

document.getElementById('btn-start').addEventListener('click', async () => {
  show('screen-scan');

  // iOS 자이로 권한 (유저 제스처 필요)
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    try { await DeviceOrientationEvent.requestPermission(); } catch (_) {}
  }

  // 자이로 리스너 등록
  window.addEventListener('deviceorientation', (e) => {
    if (!hunting) return;
    gyroQ.setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(e.beta  || 0),
      THREE.MathUtils.degToRad(e.alpha || 0),
      THREE.MathUtils.degToRad(-(e.gamma || 0)),
      'YXZ'
    ));
  });

  // MindAR 시작 (카메라 권한은 여기서 자동 요청)
  await startAR();
});

// ── MindAR 초기화 ─────────────────────────────────────────────────────────

async function startAR() {
  mindarThree = new window.MINDAR.IMAGE.MindARThree({
    container:      document.querySelector('#ar-container'),
    imageTargetSrc: './assets/targets/minhwa.mind',
    uiLoading: 'no', uiScanning: 'no', uiError: 'no',
  });

  renderer = mindarThree.renderer;
  scene    = mindarThree.scene;
  camera   = mindarThree.camera;

  scene.add(new THREE.AmbientLight(0xfff5ea, 1.2));
  const dl = new THREE.DirectionalLight(0xffeedd, 0.8);
  dl.position.set(1, 2, 1);
  scene.add(dl);

  anchor = mindarThree.addAnchor(0);
  anchor.onTargetFound = onFound;
  anchor.onTargetLost  = () => {};

  // 요정 생성
  FAIRIES.forEach(cfg => {
    const m = makeFairy(cfg);
    m.visible = false;
    m.position.set(...cfg.pos);
    anchor.group.add(m);
    meshes.push(m);
  });

  renderer.setAnimationLoop(onFrame);
  await mindarThree.start();

  // 터치
  renderer.domElement.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    checkHit((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
  }, { passive: false });
}

// ── 요정 메시 ─────────────────────────────────────────────────────────────

function makeFairy(cfg) {
  const g = new THREE.Group();
  g.userData = { id: cfg.id, caught: false };

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 16, 16),
    new THREE.MeshStandardMaterial({
      color: cfg.color, emissive: cfg.color, emissiveIntensity: 0.6,
    })
  );
  g.add(body);
  g.userData.body = body;

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 8, 8),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.2, side: THREE.BackSide })
  );
  g.add(glow);
  g.userData.glow = glow;

  g.add(new THREE.PointLight(cfg.color, 0.5, 0.15));
  return g;
}

// ── 인식 → 소환 → 탈출 ───────────────────────────────────────────────────

function onFound() {
  show('screen-found');

  // 요정 순차 등장
  meshes.forEach((m, i) => setTimeout(() => {
    m.visible = true;
    tween(t => m.scale.setScalar(t), 0, 1, 600);
  }, i * 300));

  // 2.5초 후 탈출
  setTimeout(() => {
    try { mindarThree.pause(false); } catch (_) {}

    meshes.forEach((m, i) => {
      const from = new THREE.Vector3();
      m.getWorldPosition(from);
      anchor.group.remove(m);
      scene.add(m);
      tweenVec(m.position, from, WORLD_POS[i], 1000);
    });

    setTimeout(() => {
      hunting = true;
      show('screen-hunt');
    }, 1200);
  }, 2500);
}

// ── 포획 ──────────────────────────────────────────────────────────────────

function checkHit(x, y) {
  if (!hunting) return;
  ray.setFromCamera(new THREE.Vector2(x, y), camera);
  const targets = meshes.filter(m => !m.userData.caught && m.visible).map(m => m.userData.body);
  const hits = ray.intersectObjects(targets, false);
  if (!hits.length) return;

  const mesh = meshes.find(m => m.userData.body === hits[0].object);
  if (!mesh || mesh.userData.caught) return;

  const id = mesh.userData.id;
  mesh.userData.caught = true;
  caught[id] = true;

  // 사라짐
  tween(t => mesh.scale.setScalar(1 + t * 0.4), 0, 1, 200, () =>
    tween(t => mesh.scale.setScalar(1.4 - t * 1.4), 0, 1, 300, () => { mesh.visible = false; })
  );

  // 파티클
  burst(mesh.position.clone(), FAIRIES[id].color);

  // 텍스트
  setTimeout(() => popText(FAIRIES[id].name, x, y, id), 250);

  // 카운터 점
  setTimeout(() => {
    document.getElementById(`d${id}`).classList.add('caught');
  }, 400);

  // 전부 잡으면 완료
  if (caught.every(Boolean)) setTimeout(showDone, 3500);
}

// ── 파티클 폭발 ───────────────────────────────────────────────────────────

function burst(pos, color) {
  const N = 36;
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(N * 3).fill(0).map((_, i) =>
    i % 3 === 0 ? pos.x : i % 3 === 1 ? pos.y : pos.z
  );
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.014, transparent: true, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);

  const vel = Array.from({ length: N }, () =>
    new THREE.Vector3((Math.random()-.5)*.05, Math.random()*.06, (Math.random()-.5)*.05)
  );
  let t = 0;
  (function step() {
    t += 0.018;
    const p = pts.geometry.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i*3]   += vel[i].x;
      p[i*3+1] += vel[i].y - t * 0.025;
      p[i*3+2] += vel[i].z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - t);
    if (t < 1) requestAnimationFrame(step);
    else { scene.remove(pts); geo.dispose(); mat.dispose(); }
  })();
}

// ── 텍스트 팝 ─────────────────────────────────────────────────────────────

function popText(word, nx, ny, id) {
  const el = document.createElement('div');
  el.className = 'catch-text';
  el.textContent = word;
  el.style.cssText = `
    left:${((nx+1)/2*100).toFixed(1)}%;
    top:${((-ny+1)/2*100).toFixed(1)}%;
    color:${['#E07A7A','#E0933A','#B89050'][id]};
  `;
  document.getElementById('fx').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── 방향 힌트 ─────────────────────────────────────────────────────────────

function updateHints() {
  if (!hunting) return;
  meshes.forEach((m, i) => {
    const hint = document.getElementById(`h${i}`);
    if (!hint || m.userData.caught || !m.visible) { hint?.classList.remove('show'); return; }
    const p = m.position.clone().project(camera);
    if (Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95) {
      hint.classList.remove('show');
    } else {
      hint.classList.add('show');
      const a = Math.atan2(-p.y, p.x);
      hint.style.left = (Math.cos(a) * (innerWidth/2 - 48) + innerWidth/2) + 'px';
      hint.style.top  = (innerHeight - (Math.sin(a) * (innerHeight/2 - 48) + innerHeight/2)) + 'px';
      hint.querySelector('.harrow').style.transform = `rotate(${THREE.MathUtils.radToDeg(a)+45}deg)`;
      hint.querySelector('.hdist').textContent = m.position.distanceTo(camera.position).toFixed(1) + 'm';
    }
  });
}

// ── 완료 ─────────────────────────────────────────────────────────────────

function showDone() {
  show('screen-done');
  ['w0','w1','w2'].forEach((id, i) =>
    setTimeout(() => document.getElementById(id).classList.add('pop'), i * 300 + 200)
  );
}

// ── 렌더 루프 ─────────────────────────────────────────────────────────────

function onFrame() {
  const t = clock.getElapsedTime();
  if (hunting) camera.quaternion.slerp(gyroQ, 0.08);
  meshes.forEach((m, i) => {
    if (!m.visible || m.userData.caught) return;
    m.position.y += Math.sin(t * 1.3 + i * 2) * 0.0003;
    m.rotation.y  += 0.013;
    if (m.userData.glow) m.userData.glow.material.opacity = 0.1 + Math.sin(t*2+i) * 0.08;
  });
  updateHints();
  renderer.render(scene, camera);
}

// ── 화면 전환 ─────────────────────────────────────────────────────────────

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── 트윈 유틸 ────────────────────────────────────────────────────────────

function tween(fn, from, to, ms, cb) {
  const s = performance.now();
  (function step(now) {
    const p = Math.min((now - s) / ms, 1);
    fn(p < 1 ? p : 1);
    if (p < 1) requestAnimationFrame(step); else cb?.();
  })(performance.now());
}

function tweenVec(target, from, to, ms) {
  tween(p => target.lerpVectors(from, to, p < 0.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2), 0, 1, ms);
}
