//! Security module for anti-reverse engineering protection
//!
//! 제공 기능:
//! - 디버거 탐지 / 분석도구 탐지 (릴리스 빌드에서만 동작)
//!
//! ## 제거된 것: integrity.rs
//!
//! `verify_integrity()` 는 무결성 검사처럼 보였지만 **어떤 입력에도 false 를 반환할 수
//! 없는 함수**였다. 두 판정이 모두 컴파일 타임 상수였기 때문이다:
//!   - `calculate_integrity_hash()` 는 CARGO_PKG_NAME/VERSION 을 해싱한 고정값 (0 이 아님)
//!   - `0xDEADBEEF_CAFEBABE ^ 0xFFFF_FFFF_FFFF_FFFF` 역시 고정값 (0 이 아님)
//!
//! 릴리스 진입점에서 이걸로 게이트를 걸고 있었으나 실제로는 아무것도 막지 못했다.
//! 동작하지 않는 보안 장치는 없느니만 못하므로(있다고 믿게 만든다) 제거했다.
//!
//! 진짜 변조 탐지가 필요하다면 별도 설계가 필요하다:
//!   build.rs 에서 산출물 해시를 계산해 바이너리에 심고, 런타임에 자기 자신을 다시
//!   해싱해 비교하는 방식(해시가 박힌 영역은 계산에서 제외해야 함).

pub mod anti_debug;

pub use anti_debug::check_debugger;
