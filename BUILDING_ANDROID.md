# Android 빌드 & Play Store 제출 가이드

이 가이드는 **보드게임 온라인** 웹앱을 Capacitor로 래핑해 Android APK/AAB를 빌드하고 Google Play Store에 제출하는 전 과정을 설명합니다.

---

## 아키텍처 개요

```
Capacitor 앱 (WebView 쉘)
    │
    └─→ https://board-game-online.onrender.com  (외부 서버 로드)
         │
         └─→ Socket.io 실시간 게임
```

앱은 내부에 웹 콘텐츠를 번들하지 않습니다. WebView가 Render.com 서버를 직접 로드합니다.  
단, AdMob 플러그인은 네이티브 레이어에서 동작합니다 (`window.Capacitor.Plugins.AdMob`).

---

## 사전 요구사항

| 도구 | 버전 | 설치 |
|------|------|------|
| Node.js | ≥ 18 | https://nodejs.org |
| Java JDK | 17 또는 21 | https://adoptium.net |
| Android Studio | 최신 | https://developer.android.com/studio |
| Android SDK | API 33+ | Android Studio → SDK Manager |

Android Studio 설치 후 **SDK Manager → SDK Platforms → Android 13 (API 33)** 이상 설치 확인.

---

## 1단계 — Capacitor 패키지 설치

프로젝트 루트에서:

```bash
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/android
npm install --save-dev @capacitor-community/admob
```

---

## 2단계 — Android 플랫폼 추가

```bash
npx cap add android
```

`android/` 폴더가 생성됩니다 (`.gitignore`에 포함되어 있음 — 커밋하지 마세요).

---

## 3단계 — AdMob 설정

### 3-1. AdMob 앱 ID 교체

`capacitor.config.json`을 열어 placeholder를 실제 AdMob 앱 ID로 교체:

```json
"plugins": {
  "AdMob": {
    "appId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
  }
}
```

AdMob 앱 ID는 [Google AdMob 콘솔](https://admob.google.com) → 앱 → 설정에서 확인.

### 3-2. 광고 단위 ID 교체

`public/js/admob.js` 상단의 `INTERSTITIAL_ID`를 실제 광고 단위 ID로 교체:

```javascript
const INTERSTITIAL_ID = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';
```

광고 단위는 AdMob 콘솔 → 앱 → 광고 단위 → **전면 광고** 생성 후 확인.

### 3-3. AndroidManifest.xml에 AdMob 앱 ID 추가

`android/app/src/main/AndroidManifest.xml`의 `<application>` 블록에 추가:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"/>
```

### 3-4. build.gradle에 AdMob 의존성 추가

`android/app/build.gradle`의 `dependencies` 블록에 추가:

```groovy
dependencies {
    // ... 기존 항목 ...
    implementation 'com.google.android.gms:play-services-ads:23.0.0'
}
```

---

## 4단계 — 빌드 & 동기화

웹 소스를 네이티브 프로젝트에 동기화 (서버 URL 사용 시에도 플러그인 동기화 필요):

```bash
npx cap sync android
```

---

## 5단계 — 디버그 빌드 & 테스트

### Android Studio에서 실행

```bash
npx cap open android
```

Android Studio가 열리면 디바이스 또는 에뮬레이터를 선택 후 ▶ Run.

### 커맨드라인에서 APK 빌드

```bash
cd android
./gradlew assembleDebug
# APK 위치: android/app/build/outputs/apk/debug/app-debug.apk
```

디바이스에 직접 설치:

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 6단계 — 릴리즈 빌드 (Play Store 제출용)

### 6-1. 서명 키스토어 생성 (최초 1회)

```bash
keytool -genkey -v \
  -keystore boardgame-release.keystore \
  -alias boardgame \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

**⚠️ 키스토어 파일을 절대 분실하지 마세요.** 분실 시 앱 업데이트 불가.  
`.gitignore`에 `*.keystore`가 등록되어 있어 자동으로 커밋에서 제외됩니다.

### 6-2. 서명 설정

`android/app/build.gradle`에 릴리즈 서명 설정 추가:

```groovy
android {
    signingConfigs {
        release {
            storeFile file("../../boardgame-release.keystore")
            storePassword "YOUR_STORE_PASSWORD"
            keyAlias "boardgame"
            keyPassword "YOUR_KEY_PASSWORD"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 6-3. AAB 빌드 (Play Store 권장 형식)

```bash
cd android
./gradlew bundleRelease
# AAB 위치: android/app/build/outputs/bundle/release/app-release.aab
```

---

## 7단계 — Google Play Store 제출

1. [Google Play Console](https://play.google.com/console) 접속
2. **앱 만들기** → 앱 이름: "보드게임 온라인", 언어: 한국어
3. **프로덕션 → 새 버전 만들기** → AAB 업로드
4. 필수 항목 작성:
   - 스토어 등록 정보 (설명, 스크린샷 최소 2장, 기능 그래픽 1장)
   - 콘텐츠 등급 (설문 완료 → 보통 **Everyone**)
   - 앱 카테고리: **게임 → 보드**
   - 개인정보처리방침 URL: `https://board-game-online.onrender.com/privacy.html`
5. 출시 검토 제출 (심사 보통 3일~7일 소요)

---

## 8단계 — 앱 아이콘 & 스플래시 설정 (선택)

기본 Capacitor 아이콘을 교체하려면 `@capacitor/assets` 사용:

```bash
npm install --save-dev @capacitor/assets

# public/icons/icon-512.png (512×512 PNG, 마스크 안전 영역 고려)가 있으면:
npx capacitor-assets generate
```

현재 프로젝트에 `/public/icons/icon-192.png`와 `/public/icons/icon-512.png`가 있으면 자동으로 모든 해상도 아이콘이 생성됩니다.

---

## 광고 정책 가이드라인

- 솔로 게임 종료 시에만 전면 광고 표시 (게임 중 광고 없음)
- 멀티플레이 모드에서는 광고 없음 (`isSoloMode` 체크로 자동 처리됨)
- 광고 노출 빈도: 1게임당 최대 1회 (현재 구현 동작)
- AdMob 정책: [https://support.google.com/admob/answer/6008086](https://support.google.com/admob/answer/6008086)

---

## 빠른 명령어 참조

```bash
# 최초 설정
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/admob
npx cap add android
npx cap sync android

# 반복 사용 (코드 변경 없이 설정만 바뀐 경우)
npx cap sync android

# Android Studio에서 열기
npx cap open android

# 디버그 APK
cd android && ./gradlew assembleDebug

# 릴리즈 AAB
cd android && ./gradlew bundleRelease
```

---

*작성일: 2026-05-02 | Capacitor 6.x 기준*
