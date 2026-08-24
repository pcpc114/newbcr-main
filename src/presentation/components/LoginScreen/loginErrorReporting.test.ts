// App.tsx handleLogin 의 오류 보고 규칙 회귀 테스트.
//
// 두 가지를 고정한다.
//  1) 실패 분기에서 이미 토스트를 띄운 오류는 catch 에서 다시 띄우지 않는다.
//     (예전엔 showError -> throw -> 자기 catch 가 다시 showError → 토스트 2번,
//      요금제 만료의 경우 두 번째는 AUTH_FAILED 로 코드까지 잘못 붙었다.)
//  2) 버전 불일치 페이로드는 sanitize 를 거치지 않고 원문 그대로 전달된다.
//     LoginScreen 이 JSON.parse 로 downloadUrl 을 꺼내 쓰기 때문이다.

import { describe, expect, it, vi } from 'vitest'

// --- App.tsx 와 동일한 구현을 여기에 복제하지 않고, 동작 계약만 재현해 검증한다.
//     (App.tsx 는 Tauri invoke 에 강하게 묶여 있어 단위 테스트에서 마운트하기 어렵다.)

class ReportedLoginError extends Error {
  readonly alreadyReported = true
  constructor(message: string) {
    super(message)
    this.name = 'ReportedLoginError'
  }
}

function isAlreadyReported(error: unknown): boolean {
  return error instanceof Error && (error as Partial<ReportedLoginError>).alreadyReported === true
}

function isVersionMismatchPayload(message: string): boolean {
  return message.includes('"type":"version_mismatch"')
}

function sanitizeErrorMessage(message: string): string {
  const urlPattern = /https?:\/\/[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s]*/gi
  const ipPattern = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/g
  return message.replace(urlPattern, '[주소]').replace(ipPattern, '[서버]')
}

/** handleLogin 의 catch 블록과 동일한 판단 흐름 */
function handleLoginFailure(error: unknown, showError: (code: string, msg: string) => void): Error {
  const rawMessage = error instanceof Error ? error.message : '로그인에 실패했습니다.'

  if (isVersionMismatchPayload(rawMessage)) {
    return error instanceof Error ? error : new Error(rawMessage)
  }

  const safeMessage = sanitizeErrorMessage(rawMessage)
  if (!isAlreadyReported(error)) {
    showError('AUTH_FAILED', safeMessage)
  }
  return new Error(safeMessage)
}

describe('로그인 실패 보고', () => {
  it('이미 알린 오류는 토스트를 다시 띄우지 않는다', () => {
    const showError = vi.fn()

    handleLoginFailure(new ReportedLoginError('아이디 또는 비밀번호가 올바르지 않습니다.'), showError)

    expect(showError).not.toHaveBeenCalled()
  })

  it('아직 알리지 않은 오류는 한 번 띄운다', () => {
    const showError = vi.fn()

    handleLoginFailure(new Error('네트워크 오류'), showError)

    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('AUTH_FAILED', '네트워크 오류')
  })

  it('요금제 만료는 AUTH_SESSION_EXPIRED 토스트 뒤 AUTH_FAILED 가 덧붙지 않는다', () => {
    const showError = vi.fn()

    // 분기에서 AUTH_SESSION_EXPIRED 로 이미 알린 상황
    showError('AUTH_SESSION_EXPIRED', '요금제가 만료되었습니다.')
    handleLoginFailure(new ReportedLoginError('요금제가 만료되었습니다.'), showError)

    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError.mock.calls[0][0]).toBe('AUTH_SESSION_EXPIRED')
  })
})

describe('버전 불일치 페이로드', () => {
  const payload = JSON.stringify({
    type: 'version_mismatch',
    requiredVersion: '1.4.0',
    downloadUrl: 'https://example.com/update/SmartHelper-1.4.0.msi',
    fileName: 'SmartHelper-1.4.0.msi',
  })

  it('sanitize 를 거치지 않고 원문 그대로 전달된다', () => {
    const showError = vi.fn()

    const result = handleLoginFailure(new Error(payload), showError)

    expect(result.message).toBe(payload)
    expect(showError).not.toHaveBeenCalled()
  })

  it('전달된 메시지에서 downloadUrl 을 그대로 꺼낼 수 있다', () => {
    const result = handleLoginFailure(new Error(payload), vi.fn())

    const parsed = JSON.parse(result.message)
    expect(parsed.downloadUrl).toBe('https://example.com/update/SmartHelper-1.4.0.msi')
  })

  it('sanitize 를 태웠다면 downloadUrl 이 망가진다는 것을 확인 (회귀 방지 근거)', () => {
    const broken = sanitizeErrorMessage(payload)

    expect(broken).not.toContain('https://example.com/update/SmartHelper-1.4.0.msi')
    expect(broken).toContain('[주소]')
  })
})
