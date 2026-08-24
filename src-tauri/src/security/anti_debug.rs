//! Anti-debugging detection for Windows
//!
//! Detects common debugging techniques and analysis tools.

#[cfg(target_os = "windows")]
use std::ffi::c_void;

/// 보안 검사가 막은 이유. 사용자에게 보여줄 안내 문구를 만들 때 쓴다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockReason {
    /// 디버거가 붙어 있음
    Debugger,
    /// 분석 도구가 실행 중임 (프로세스 이름 기준)
    AnalysisTool,
}

impl BlockReason {
    /// 사용자에게 보여줄 안내 문구.
    ///
    /// 이전에는 `tracing::error!("E01")` 만 남기고 `process::exit(1)` 했다.
    /// 릴리스 빌드에는 콘솔이 없어서, 사용자 입장에서는 아이콘을 눌러도
    /// 아무 일도 일어나지 않는 것처럼 보였다. 무엇을 끄면 되는지 알려준다.
    pub fn user_message(self) -> &'static str {
        match self {
            BlockReason::Debugger => {
                "디버거가 감지되어 프로그램을 종료합니다.\n\n\
                 디버깅 도구를 종료한 뒤 다시 실행해 주세요."
            }
            BlockReason::AnalysisTool => {
                "분석 도구가 실행 중이어서 프로그램을 종료합니다.\n\n\
                 아래 프로그램이 켜져 있으면 종료한 뒤 다시 실행해 주세요:\n\
                 Wireshark, Fiddler, Process Monitor, Process Explorer,\n\
                 x64dbg, x32dbg, OllyDbg, IDA, Ghidra"
            }
        }
    }

    /// 로그에 남길 짧은 코드
    pub fn code(self) -> &'static str {
        match self {
            BlockReason::Debugger => "E01",
            BlockReason::AnalysisTool => "E01-T",
        }
    }
}

/// Check if a debugger is attached to the process
#[cfg(target_os = "windows")]
pub fn check_debugger() -> bool {
    unsafe {
        // Windows API: IsDebuggerPresent
        #[link(name = "kernel32")]
        extern "system" {
            fn IsDebuggerPresent() -> i32;
            fn CheckRemoteDebuggerPresent(
                hProcess: *mut c_void,
                pbDebuggerPresent: *mut i32,
            ) -> i32;
            fn GetCurrentProcess() -> *mut c_void;
        }

        // Check 1: IsDebuggerPresent
        if IsDebuggerPresent() != 0 {
            tracing::warn!("SC1");
            return true;
        }

        // Check 2: Remote debugger
        let mut is_remote_debugger: i32 = 0;
        let process = GetCurrentProcess();
        if CheckRemoteDebuggerPresent(process, &mut is_remote_debugger) != 0
            && is_remote_debugger != 0
        {
            tracing::warn!("SC2");
            return true;
        }

        // Check 3: 타이밍 기반 탐지 (디버거가 붙으면 실행이 느려진다)
        if timing_looks_debugged() {
            tracing::warn!("SC3");
            return true;
        }

        false
    }
}

/// 타이밍 탐지. **여러 번 재서 가장 빠른 값**으로 판단한다.
///
/// 예전 구현은 1000회 루프를 한 번만 재고 10ms 를 넘으면 디버거로 단정했다.
/// 임계값 자체는 넉넉했지만 **단 한 번의 측정**이라, OS 스케줄러가 그 순간
/// 스레드를 뺏기만 해도 곧바로 오탐이 났다. 부하가 걸린 PC 에서 앱이 이유 없이
/// 꺼지는 원인이 될 수 있다.
///
/// 최소값을 쓰면 스케줄링 잡음에 강해진다. 디버거가 실제로 붙어 있으면 모든
/// 시행이 느리므로 최소값도 임계값을 넘는다.
#[cfg(target_os = "windows")]
fn timing_looks_debugged() -> bool {
    const ATTEMPTS: usize = 5;
    const ITERATIONS: usize = 1000;
    const THRESHOLD_MICROS: u128 = 10_000;

    let mut fastest = u128::MAX;

    for _ in 0..ATTEMPTS {
        let start = std::time::Instant::now();
        for _ in 0..ITERATIONS {
            std::hint::black_box(0);
        }
        let elapsed = start.elapsed().as_micros();
        if elapsed < fastest {
            fastest = elapsed;
        }
        // 한 번이라도 충분히 빠르면 디버거가 아니다 — 더 잴 필요 없다.
        if fastest <= THRESHOLD_MICROS {
            return false;
        }
    }

    fastest > THRESHOLD_MICROS
}

#[cfg(not(target_os = "windows"))]
pub fn check_debugger() -> bool {
    // macOS/Linux: Check for ptrace
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        if let Ok(status) = fs::read_to_string("/proc/self/status") {
            if !status.contains("TracerPid:\t0") {
                return true;
            }
        }
    }
    false
}

/// Check for common analysis tools by process name
#[cfg(target_os = "windows")]
pub fn check_analysis_tools() -> bool {
    use std::process::Command;

    // XOR-encoded tool names (decoded at runtime)
    const KEY: u8 = 0x5A;
    let tools: &[&[u8]] = &[
        &[0x32, 0x3e, 0x34, 0x0e, 0x0c, 0x0f],       // x64dbg
        &[0x32, 0x6b, 0x32, 0x0e, 0x0c, 0x0f],       // x32dbg
        &[0x35, 0x36, 0x36, 0x31, 0x0e, 0x0c, 0x0f], // ollydbg
        &[0x33, 0x0e, 0x0b, 0x6e, 0x34],             // ida64
        &[0x3f, 0x38, 0x33, 0x0e, 0x28, 0x0b],       // ghidra
        &[0x2d, 0x33, 0x28, 0x39, 0x29, 0x38, 0x0b, 0x28, 0x35], // wireshark
        &[0x3c, 0x33, 0x0e, 0x0e, 0x36, 0x39, 0x28], // fiddler
        &[0x2a, 0x28, 0x35, 0x03, 0x37, 0x35, 0x34], // procmon
        &[0x2a, 0x28, 0x35, 0x03, 0x39, 0x32, 0x2a], // procexp
    ];

    if let Ok(output) = Command::new("tasklist").output() {
        let task_list = String::from_utf8_lossy(&output.stdout).to_lowercase();

        for tool in tools {
            let decoded: String = tool.iter().map(|b| (b ^ KEY) as char).collect();
            if task_list.contains(&decoded) {
                tracing::warn!("SC4");
                return true;
            }
        }
    }

    false
}

#[cfg(not(target_os = "windows"))]
pub fn check_analysis_tools() -> bool {
    false
}

/// 모든 보안 검사를 돌리고, 막아야 할 이유가 있으면 그 이유를 돌려준다.
///
/// 예전 시그니처(`-> bool`)는 "왜" 막혔는지를 버렸다. `BlockReason` 을 돌려주면
/// 호출부가 사용자에게 원인에 맞는 안내를 띄운 뒤 종료할 수 있다.
pub fn run_security_checks() -> Option<BlockReason> {
    if check_debugger() {
        return Some(BlockReason::Debugger);
    }

    #[cfg(target_os = "windows")]
    if check_analysis_tools() {
        return Some(BlockReason::AnalysisTool);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_reason_has_message_and_code() {
        for reason in [BlockReason::Debugger, BlockReason::AnalysisTool] {
            assert!(!reason.user_message().is_empty());
            assert!(!reason.code().is_empty());
        }
    }

    #[test]
    fn timing_check_is_stable_under_normal_load() {
        // 디버거가 없는 정상 실행에서는 오탐(=true)이 나오면 안 된다.
        // (테스트 자체가 디버거 아래서 돌면 실패할 수 있으므로 CI 정상 실행 기준.)
        #[cfg(target_os = "windows")]
        assert!(!timing_looks_debugged());
    }
}
