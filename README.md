# SmartHelper (bcr-predictor)

Tauri 2 + React 18 + TypeScript 데스크톱 애플리케이션.

- `src/` — 프런트엔드. 도메인 / 애플리케이션 / 인프라 / 프레젠테이션 4계층
- `src-tauri/` — Rust 백엔드. Evolution·Pragmatic 연동, CDP(Chrome DevTools Protocol) 제어
- `docs/` — 설계 문서(`specs/`)와 작업 계획(`plans/`)

---

## 빌드 전제조건

아래 4가지가 **모두** 있어야 빌드됩니다. 하나라도 없으면 실패합니다.

| 도구 | 검증된 버전 | 설치 |
|---|---|---|
| Node.js | v24.18.0 | https://nodejs.org |
| Rust | 1.97.1 (`stable-x86_64-pc-windows-msvc`) | https://rustup.rs |
| **CMake** | 4.4.2 | `winget install --id Kitware.CMake --exact` |
| **NASM** | 3.02 | `winget install --id NASM.NASM --exact` |
| **LLVM (libclang)** | — | `winget install --id LLVM.LLVM --exact` |
| MSVC Build Tools 2022 | C++ 워크로드 포함 | Visual Studio Installer |

### ⚠️ CMake가 왜 필요한가

가장 빠뜨리기 쉬운 항목입니다. 의존성 `wreq`가 내부적으로 `boring-sys2`(BoringSSL)를 쓰는데,
이 크레이트의 빌드 스크립트가 CMake를 직접 호출합니다. CMake가 PATH에 없으면 이렇게 실패합니다:

```
error: failed to run custom build command for `boring-sys2 v5.0.0-alpha.13`
  thread 'main' panicked at cmake-0.1.57/src/lib.rs:1132:5:
  failed to execute command: program not found
  is `cmake` not installed?
```

Rust 코드 문제가 아니라 **환경 문제**입니다. CMake를 설치하고 터미널을 새로 열면 해결됩니다.

### ⚠️ NASM도 필요합니다

CMake만 깔고 넘어가면 다음 단계에서 다시 막힙니다:

```
CMake Error at CMakeLists.txt:50 (enable_language):
  No CMAKE_ASM_NASM_COMPILER could be found.
```

`boring-sys2/build/main.rs`에 Windows에서 `OPENSSL_NO_ASM=YES`를 거는 코드가 있지만,
실제 실행되는 cmake 명령줄에는 그 옵션이 전달되지 않아 BoringSSL이 NASM을 요구합니다.
소스만 보고 판단하지 말고 NASM을 함께 설치하세요.

NASM 설치 프로그램은 PATH를 자동으로 잡아주지 않을 수 있습니다. 설치 후
`nasm --version`이 동작하지 않으면 설치 경로를 사용자 PATH에 직접 추가해야 합니다.
(이 PC에서는 `C:\Users\<사용자>\AppData\Local\bin\NASM`에 설치됐고 PATH 등록이 필요했습니다.)

### ⚠️ LLVM(libclang)도 필요합니다

NASM까지 통과해 BoringSSL이 실제로 컴파일된 뒤, 그다음 단계에서 또 막힙니다:

```
thread 'main' panicked at bindgen-0.72.1/lib.rs:616:27:
Unable to find libclang: "couldn't find any valid shared libraries matching:
['clang.dll', 'libclang.dll'], set the `LIBCLANG_PATH` environment variable ..."
```

`boring-sys2`가 bindgen으로 C 헤더 바인딩을 생성하는데, bindgen은 `libclang.dll`을 필요로 합니다.
MSVC Build Tools에는 기본으로 포함되지 않으므로 LLVM을 따로 설치해야 합니다.
설치 후에도 못 찾으면 `LIBCLANG_PATH` 환경변수를 `C:\Program Files\LLVM\bin`으로 지정하세요.

> **정리:** Rust 백엔드 빌드에는 CMake · NASM · LLVM 세 가지가 모두 필요합니다.
> 하나씩 순차적으로 실패하기 때문에, 처음 세팅할 때 세 개를 한 번에 설치하는 편이 낫습니다.
>
> ```
> winget install --id Kitware.CMake --exact
> winget install --id NASM.NASM --exact
> winget install --id LLVM.LLVM --exact
> ```

### ⚠️ `cargo check` 전에 `npm run build`를 먼저 하세요

`src-tauri/tauri.conf.json`의 `frontendDist`가 `"../dist"`로 지정돼 있고,
`tauri::generate_context!` 매크로가 **컴파일 시점에** 그 폴더의 존재를 확인합니다.
`dist/`가 없으면 Rust 코드에 아무 문제가 없어도 이렇게 실패합니다:

```
error: proc macro panicked
  --> src\lib.rs:356:14
  = help: message: The `frontendDist` configuration is set to `"../dist"`
          but this path doesn't exist
```

`dist/`는 `.gitignore`에 있어서 저장소를 새로 클론하면 없는 상태입니다. 순서를 지키세요:

```bash
npm install
npm run build      # dist/ 생성 — 이게 먼저
cd src-tauri
cargo check --all-targets
```

`npm run tauri build`와 `npm run tauri:dev`는 `beforeBuildCommand`/`beforeDevCommand` 설정 덕분에
프런트엔드를 자동으로 먼저 빌드하므로 이 문제가 없습니다. **맨손으로 `cargo` 명령을 직접 칠 때만** 해당됩니다.

---

## 설치

```bash
npm install
```

Rust 의존성은 첫 `cargo` 실행 시 자동으로 받습니다. BoringSSL을 소스에서 컴파일하므로
**최초 빌드는 수 분에서 십수 분** 걸리고 `src-tauri/target/`이 1 GB 이상으로 커집니다.
두 번째부터는 증분 빌드라 빠릅니다.

---

## 명령어

| 목적 | 명령 |
|---|---|
| 프런트엔드 개발 서버 | `npm run dev` (포트 1420 고정) |
| 데스크톱 앱 개발 실행 | `npm run tauri:dev` |
| 프런트엔드 프로덕션 빌드 | `npm run build` (`tsc` + `vite build`) |
| 테스트 (watch) | `npm test` |
| 테스트 (1회) | `npm run test:run` |
| 커버리지 | `npm run test:coverage` |
| Rust 타입 검사 | `cd src-tauri && cargo check --all-targets` |
| 배포용 앱 빌드 | `npm run tauri build` |

개발 서버 포트는 `strictPort: true`라 1420이 사용 중이면 다른 포트로 넘어가지 않고 실패합니다.

---

## 환경 변수

| 변수 | 적용 시점 | 설명 |
|---|---|---|
| `BCR_API_BASE_URL` | **컴파일 타임** (`option_env!`) | 예측 API 주소. 미지정 시 소스의 기본값 사용 |
| `BCR_DIAGNOSTICS` | 실행 시 | `1`/`true`면 런타임 로그를 파일로 기록 |
| `BCR_DIAGNOSTICS_DIR` | 실행 시 | 로그 저장 위치. 기본값은 임시폴더의 `newbcr-diagnostics/` |
| `BCR_BET_CAPTURE` | 실행 시 | `1`/`true`면 Rust가 멀티위젯에 연결하지 않고 베팅 메시지만 캡처(실제 전송 차단) |
| `RUST_LOG` | 실행 시 | 로그 레벨. 미지정 시 `lib.rs`의 기본 필터 적용 |

`BCR_API_BASE_URL`은 `option_env!`라 **빌드할 때** 값이 박힙니다. 실행 중 바꿀 수 없습니다.

---

## 알려진 이슈

- **버전 번호가 3곳에서 어긋나 있습니다** — `package.json` 1.0.0 / `src-tauri/tauri.conf.json` 1.3.3 /
  `src-tauri/Cargo.toml` 1.3.4. 릴리스 전에 통일이 필요합니다.
- 릴리스 빌드는 `panic = "abort"`, `strip = "symbols"`, 콘솔 로그 제거가 적용됩니다.
  디버깅이 필요하면 디버그 빌드를 쓰세요.
- 릴리스 빌드에서만 안티디버그 검사가 동작합니다. Wireshark·Fiddler·procmon·procexp가
  실행 중이면 앱이 메시지 없이 종료됩니다 (`src-tauri/src/security/anti_debug.rs`).
