# Code Refactoring Plan - 바이브 코딩 제거

## 목표
전체 코드베이스에서 "바이브 코딩" 안티패턴 제거:
- 의미없는 타입 래퍼/별칭 제거
- 불필요한 함수 래퍼 제거
- SDK 함수 재조립 제거
- 거대 컴포넌트 분해 및 관심사 분리
- 코드 유지보수성 향상

## 바이브 코딩 규칙
1. **타입은 인라인으로** - 의미없는 타입 별칭 만들지 말기
2. **의미없는 래퍼 금지** - 같은 I/O 시그니처로 단순 호출만 하는 래퍼 금지
3. **쓸모없는 타입 인자 받지말기** - 사용되지 않는 제네릭 타입 파라미터 금지

## ⚠️ 리팩토링 핵심 원칙 (최우선)

### 1. 기존 동작 100% 보존
**절대 규칙: 코드 정리가 목적이지, 기능 변경이 목적이 아님**

- ✅ **구조만 변경** - 함수/훅/컴포넌트로 분리
- ❌ **로직 개선 금지** - "더 나은 방법"으로 바꾸지 말 것
- ❌ **디테일 추가 금지** - 새로운 기능이나 엣지 케이스 처리 추가하지 말 것
- ⚠️ **디테일 제거 신중** - 기존 세심한 처리는 보존, **정말 정말 명백히 불필요한 것만** 삭제 가능
  - 예: 사용되지 않는 변수, 주석 처리된 코드, 중복된 console.log
  - 주의: timeout 값, 조건문, ref 패턴 등은 **절대 삭제 불가**

### 2. 특히 주의할 로직들 (열심히 만든 부분)

**스크롤 추적 로직:**
- `isAtBottomRef`, `updateIsAtBottom()` - threshold 80px 정확히 유지
- "새 메시지" 마커 표시/숨김 타이밍
- `markerClearTimeoutRef` 250ms 지연
- Scroll visibility 체크 로직
- `prevScrollHeightRef`, `prevScrollTopRef` 기반 위치 복원
- `lastInsertModeRef` (prepend/append) 처리

**WebSocket 연결 관리:**
- Exponential backoff (2000ms → 30000ms)
- Ping/pong heartbeat (15초 간격, 45초 타임아웃)
- Visibility change 처리
- Subscribe/unsubscribe 동기화 로직
- `clearPing()`, `scheduleReconnect()` 타이밍

**메시지 마커 로직:**
- `dmMarkerByChannelRef` 채널별 관리
- Own message vs Other message 구분
- Scroll position에 따른 마커 자동 제거
- Channel 전환 시 마커 복원

### 3. 리팩토링 검증 체크리스트

각 리팩토링 후 반드시 확인:
- [ ] 기존 함수 시그니처 동일한가?
- [ ] 모든 엣지 케이스 처리 그대로인가?
- [ ] Timeout/interval 값 정확히 동일한가?
- [ ] Ref 사용 패턴 동일한가?
- [ ] useCallback/useMemo 의존성 배열 동일한가?
- [ ] 조건문 로직 정확히 동일한가?

### 4. 추출 방식

**좋은 예:**
```typescript
// Before: friends-list.tsx (lines 294-328)
const updateDmIsAtBottom = useCallback(() => {
  const el = chatListRef.current;
  if (!el) return;
  const threshold = 80;
  // ... 정확히 동일한 로직
}, [clearDmMarker, selectedDmChannelKey]);

// After: lib/shared/use-scroll-tracker.ts
export function useScrollTracker(params) {
  const updateIsAtBottom = useCallback(() => {
    const el = params.listRef.current;
    if (!el) return;
    const threshold = 80; // 정확히 80 유지!
    // ... 정확히 동일한 로직 (복사-붙여넣기 수준)
  }, [params.clearMarker, params.selectedChannelKey]);

  return { updateIsAtBottom, ... };
}
```

**나쁜 예:**
```typescript
// ❌ 개선하려고 하지 말 것!
export function useScrollTracker(params) {
  const updateIsAtBottom = useCallback(() => {
    const el = params.listRef.current;
    if (!el) return;
    const threshold = 100; // ❌ 80 → 100으로 "개선"
    // ❌ requestAnimationFrame 추가
    // ❌ throttle 추가
    // ❌ "더 나은" 로직으로 변경
  }, []);
}
```

---

## PHASE 1: lib/ 유틸리티 정리 ✅ COMPLETED

### 완료된 작업
1. ✅ `Row` 타입 별칭 제거 → `Record<string, unknown>` 직접 사용
2. ✅ `bytesToHex()` 중복 함수 제거 (2개 파일) → `Buffer.from().toString('hex')` 직접 사용
3. ✅ `createPendingMessage()` 래퍼 제거 → spread operator 직접 사용
4. ✅ `deriveDmSeedPair()` 미사용 함수 제거
5. ✅ 중간 변수 정리 (request-connection.ts의 `requesterBase58`, `receiverBase58`)

### 수정된 파일
- lib/shared/message-helpers.ts
- lib/shared/message.ts
- lib/shared/use-pending-messages.ts
- lib/friends/utils.ts
- lib/friends/use-friends.ts
- lib/friends/request-connection.ts
- components/chat/chat-client.tsx

---

## PHASE 2: 거대 컴포넌트 분석 및 리팩토링

### 2.1 friends-list.tsx (1,419줄) - 최우선

#### 현재 문제점
**너무 많은 책임:**
1. 친구 목록 관리 (fetching, filtering, displaying)
2. DM 채팅 UI 전체
3. WebSocket 연결 관리
4. 친구 요청 처리 (add, approve, block, unblock)
5. 메시지 로딩 및 캐싱
6. 스크롤 추적 및 "새 메시지" 마커
7. 토스트 알림
8. 첨부파일 처리
9. 실시간 업데이트

#### 리팩토링 계획

##### Priority 2.1.1: 유틸리티 함수 추출
**파일: lib/shared/channel-utils.ts (공통)**
- [x] `makeDmChannelKey()` 추가 (line 49)
- [x] `dmChannelKeyToSeed()` 추가 (line 50)
- [x] `dmRoomIdToChannelKey()` 추가 (line 51)

**파일: lib/utils/error-utils.ts (신규)**
- [x] `extractErrorLogs()` 이동 (lines 1403-1419)

##### Priority 2.1.2: 커스텀 훅 추출
**파일: lib/shared/use-websocket-channel.ts (신규)**
- [x] WebSocket 연결 관리 로직 (lines 638-782, 144줄)
  - Connection, reconnection with exponential backoff
  - Ping/pong heartbeat (15s interval, 45s timeout)
  - Subscribe/unsubscribe to room IDs
  - Visibility change handling

**파일: lib/shared/use-scroll-tracker.ts (신규)**
- [x] 스크롤 위치 추적 (lines 294-328)
- [x] "새 메시지" 마커 관리 (lines 448-485)
- [x] 자동 스크롤 로직

**파일: lib/shared/use-message-sender.ts (신규)**
- [x] DM/Room 메시지 전송 공통 파이프라인

**파일: lib/shared/use-message-reader.ts (신규)**
- [x] useMessageIndexLoader 래퍼

**파일: lib/shared/use-message-channel.ts (신규)**
- [x] reader + pending + sender 결합 (friends-list/chat-client 적용)

**파일: lib/friends/use-friend-alerts.ts (신규)**
- [x] 친구 타임스탬프 추적 (lines 191-209)
- [x] DM 알림 상태 관리 (lines 211-220)
- [x] 토스트 알림 로직 (lines 243-255)

##### Priority 2.1.3: 서브 컴포넌트 추출
**파일: components/friends/dm-chat-modal.tsx (신규)**
- [x] DM 채팅 모달 전체 UI (lines 1182-1346, 164줄)
  - Header with friend info
  - Message list
  - Input form
  - "Scroll to bottom" button
  - Status banners

**파일: components/friends/friends-list-view.tsx (신규)**
- [x] 친구 리스트 뷰 (lines 1082-1181, 99줄)
  - Tab buttons (All/Pending/Blocked)
  - Loading/empty states
  - Friend cards grid

**파일: components/friends/add-friend-modal.tsx (신규)**
- [x] 친구 추가 모달 (lines 1348-1364, 16줄)

**파일: components/friends/block-confirm-modal.tsx (신규)**
- [x] 차단 확인 모달 (lines 1366-1393, 27줄)

##### Priority 2.1.4: 비즈니스 로직 분리
**파일: lib/friends/dm-fetcher.ts (신규)**
- [x] `fetcher()` 함수 (lines 354-418, 64줄)
- [x] `decodeRowsFromSignatures()` 헬퍼 (lines 367-408)

##### Priority 2.1.5: 의미없는 코드 제거
- [x] `chatFriendTable` useMemo 제거 → 인라인 사용 (lines 330-338)
- [ ] `chatError` 별칭 제거 (line 487)
- [ ] 타임스탬프 업데이트 중복 패턴 → 단일 함수로 통합 (lines 1014-1019) *(보류: 동작 차이 있음)*

**예상 결과:**
- 메인 FriendsList 컴포넌트: ~300-400줄 (1,419줄 → 70% 감소)

---

### 2.2 chat-client.tsx (1,275줄) - 고우선순위

#### 현재 문제점
**너무 많은 책임:**
1. Root account 관리 (check, create)
2. Room 관리 (load, create)
3. 메시지 로딩 및 표시
4. WebSocket 연결 관리
5. 스크롤 추적 및 "새 메시지" 마커
6. 메시지 전송
7. Account change 구독
8. UI 상태 관리

**중복 패턴 (friends-list.tsx와 유사):**
- WebSocket 관리 로직 (lines 665-777) - friends-list와 거의 동일
- 스크롤 추적 로직 (lines 854-893) - friends-list와 거의 동일
- 채널 키 변환 함수 (lines 70-73) - friends-list와 유사

#### 리팩토링 계획

##### Priority 2.2.1: 유틸리티 함수 추출
**파일: lib/shared/channel-utils.ts (공통)**
- [x] `makeChannelKey()` 추가 (line 70)
- [x] `channelKeyToSeed()` 추가 (line 71)
- [x] `channelKeyToRoomId()` 추가 (line 72)
- [x] `roomIdToChannelKey()` 추가 (line 73)

##### Priority 2.2.2: 중복 제거
**중요: friends-list.tsx와 chat-client.tsx는 거의 동일한 WebSocket/스크롤 로직 사용**
- [x] `use-websocket-channel.ts` 일반화 및 적용
- [x] `use-scroll-tracker.ts` 재사용
- [x] `use-message-channel.ts`로 reader/sender/pending 결합 적용

##### Priority 2.2.3: 커스텀 훅 추출
**파일: lib/chat/use-root-account.ts (신규)**
- [x] Root account 체크 로직 (lines 407-429)
- [x] Root account 생성 로직 (lines 432-457)

**파일: lib/chat/use-rooms.ts (신규)**
- [x] Room 로딩 로직 (lines 463-540, 77줄)
- [x] Room 생성 로직 (lines 965-1016, 51줄)

**파일: lib/shared/use-message-sender.ts (공통)**
- [x] 메시지 전송 로직 공통화 (기존 use-send-message 대체)

##### Priority 2.2.4: 비즈니스 로직 분리
**파일: lib/chat/message-fetcher.ts (신규)**
- [x] `fetcher()` 함수 (lines 276-295)
- [x] `decodeRowsFromSignatures()` (lines 236-274)

##### Priority 2.2.5: 의미없는 코드 제거
- [x] `Row` 타입 별칭 제거 (line 39) → `Record<string, unknown>` 직접 사용
- [x] `tableAccount` useMemo 제거 → 인라인 사용 (line 195)
- [x] `RootAccountData`, `TableAccountData` 타입 제거 (lines 40-50)

**예상 결과:**
- 메인 ChatClient 컴포넌트: ~400-500줄 (1,275줄 → 60% 감소)

---

### 2.3 user-profile-manager.tsx (528줄) - 완료

#### 완료된 분리
- `components/users/use-user-profile-manager.ts`로 데이터 로직 이동
  - `extractUserMetadata`, `parseMetadata` 포함
  - load/save/friend-request 로직 포함
- `components/users/types.ts`에 `UserProfile` 타입 분리
- `user-profile-manager.tsx`는 UI + 탭 상태만 유지

---

## PHASE 3: app/ 라우터 (완료)

#### 정리된 항목
- `app/opengraph-image.tsx` / `app/twitter-image.tsx` 중복 제거
  - `app/social-image.tsx`로 공통 이미지 마크업 분리
- `app/friends/page.tsx`의 불필요한 `searchParams` Promise 타입 제거

---

## 진행 상황 추적

### PHASE 1: ✅ 완료 (100%)
- 7개 파일 수정
- 모든 의미없는 래퍼/타입 제거 완료

### PHASE 2: 🔄 진행중 (~95%)
- [x] 공통 유틸/훅 정리 (channel-utils, error-utils, use-websocket-channel, use-scroll-tracker)
- [x] 메시지 전송/리더/채널 공통화 (use-message-sender/reader/channel)
- [x] 의미없는 타입/useMemo 제거 (chat-client)
- [x] friends-list 서브 컴포넌트 분리
- [x] friends-list 전용 로직 분리 (dm-fetcher, friend-alerts)
- [x] chat-client 전용 로직 분리 (root-account, rooms, message-fetcher)
- [x] user-profile-manager 리팩토링

### PHASE 3: ✅ 완료
- app/ 라우터 분석 및 중복 정리

---

## 다음 단계 - 추천 순서

### 다음 단계 (업데이트됨)
1. **잔여 타입 에러 정리 (SignerInput vs Signer, sendTransaction 시그니처)**

## 참고사항

### 코드 스멜 패턴
1. ❌ 단일 책임 원칙 위반 (1000줄 이상 컴포넌트)
2. ✅ WebSocket 로직 중복 해결 (`use-websocket-channel.ts`)
3. ✅ 스크롤 로직 중복 해결 (`use-scroll-tracker.ts`)
4. ✅ 채널 키 변환 로직 중복 해결 (`channel-utils.ts`)
5. ⚠️ 불필요한 useMemo 일부 제거 (chatFriendTable/tableAccount 완료)
6. ❌ 타임스탬프 업데이트 중복 패턴 *(보류)*
7. ✅ `Row` 타입 별칭 제거 완료 (chat-client.tsx)
8. ❌ 메시지 디코딩 로직 중복 (`decodeRowsFromSignatures` 함수)

### 개선 후 기대 효과
1. ✅ 컴포넌트 크기 60-70% 감소
2. ✅ 재사용 가능한 커스텀 훅 증가
3. ✅ 중복 코드 제거
4. ✅ 테스트 용이성 향상
5. ✅ 유지보수성 향상
