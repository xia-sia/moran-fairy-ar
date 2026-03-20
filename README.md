# 사월의 부귀, 개화 🌸

민화 모란도에서 세 요정이 깨어납니다.  
AR로 요정을 찾아 잡아보세요.

---

## 프로젝트 구조

```
moran-fairy-ar/
├── index.html              # 인트로 화면
├── ar.html                 # AR 메인 경험
├── css/
│   └── ar.css              # AR 화면 스타일
├── js/
│   └── fairy-ar.js         # AR 코어 로직
├── assets/
│   └── targets/
│       └── minhwa.mind     # ← 이 파일을 생성해야 합니다 (아래 참고)
└── README.md
```

---

## 시작 전 필수: `.mind` 파일 생성

MindAR은 이미지를 인식하기 위해 `.mind` 파일이 필요합니다.

### 방법 1 — 웹 컴파일러 사용 (추천)

1. **[https://hiukim.github.io/mind-ar-js-doc/tools/compile](https://hiukim.github.io/mind-ar-js-doc/tools/compile)** 접속
2. 민화 이미지 업로드 (고해상도 권장, 최소 800px)
3. **"Export"** 클릭 → `targets.mind` 다운로드
4. 파일명을 `minhwa.mind` 으로 변경
5. `assets/targets/` 폴더에 넣기

> 💡 **팁**: 민화 이미지는 특징점이 풍부할수록 인식이 잘 됩니다.  
> 단색 배경보다 모란의 꽃잎, 잎사귀 디테일이 많이 담긴 크롭이 좋아요.

---

## GitHub Pages 배포

```bash
# 1. 레포 생성 (GitHub에서)
#    Settings → Pages → Source: main branch / root

# 2. 로컬 클론
git clone https://github.com/your-username/moran-fairy-ar.git
cd moran-fairy-ar

# 3. 파일 복사 후 커밋
git add .
git commit -m "initial commit"
git push origin main

# 4. 배포 URL
# https://your-username.github.io/moran-fairy-ar/
```

> ⚠️ **HTTPS 필수**: 카메라와 자이로스코프 API는 HTTPS에서만 작동합니다.  
> GitHub Pages는 자동으로 HTTPS를 제공합니다.

---

## 로컬 테스트

Live Server 없이 직접 파일을 열면 카메라가 작동하지 않습니다.  
VS Code의 **Live Server** 또는 아래 명령어로 로컬 서버를 실행하세요:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

그 다음 `http://localhost:8080` 접속.

---

## 요정 시스템

| 요정 | 색상 | 포획 시 텍스트 | 파티클 |
|------|------|----------------|--------|
| 1번  | 분홍 `#E07A7A` | **부귀** | 분홍 꽃잎 |
| 2번  | 주황 `#E0933A` | **영화** | 황금빛 꽃잎 |
| 3번  | 아이보리 `#C8A96E` | **사랑** | 아이보리 꽃잎 |

셋 모두 포획하면 **부귀 · 영화 · 사랑** 엔딩 연출이 시작됩니다.

---

## 3D 요정 모델 교체 (나중에)

현재는 Three.js 임시 geometry(구체)로 표현됩니다.  
GLTF/GLB 모델 준비되면 `fairy-ar.js`의 `createFairy()` 함수를 교체하면 됩니다:

```javascript
// fairy-ar.js → createFairy() 함수 안에서
const loader = new THREE.GLTFLoader();
loader.load('./assets/models/fairy.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(0.05, 0.05, 0.05);
  group.add(model);
});
```

---

## 스택

- [MindAR.js](https://github.com/hiukim/mind-ar-js) — 이미지 트래킹
- [Three.js](https://threejs.org) — 3D 렌더링
- GitHub Pages — 배포
- 외부 빌드 도구 없음 (vanilla HTML/CSS/JS)
