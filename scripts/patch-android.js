// 在 `npx expo prebuild` 之後執行，補上體積優化設定
// （android/ 不進 git，每次 prebuild 都需要重新套用）
const fs = require('fs');
const path = require('path');

const gradlePropsPath = path.join(__dirname, '..', 'android', 'gradle.properties');
const proguardPath = path.join(__dirname, '..', 'android', 'app', 'proguard-rules.pro');

function patchGradleProperties() {
  let content = fs.readFileSync(gradlePropsPath, 'utf8');

  if (content.includes('android.enableMinifyInReleaseBuilds')) {
    console.log('gradle.properties 已是最新，略過');
    return;
  }

  content = content.replace(
    /reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64/,
    `# 只保留實體手機常見的 ABI，移除模擬器用的 x86/x86_64 以縮小體積
reactNativeArchitectures=armeabi-v7a,arm64-v8a

# ── 體積優化 ──────────────────────────────────────────────────
# R8 混淆 + 死碼移除（release 才生效）
android.enableMinifyInReleaseBuilds=true
# 移除未使用的資源（必須搭配 minify 才能啟用）
android.enableShrinkResourcesInReleaseBuilds=true`
  );

  fs.writeFileSync(gradlePropsPath, content, 'utf8');
  console.log('已更新 gradle.properties');
}

function patchProguardRules() {
  let content = fs.readFileSync(proguardPath, 'utf8');

  if (content.includes('R8 啟用後的安全保留規則')) {
    console.log('proguard-rules.pro 已是最新，略過');
    return;
  }

  content += `
# ── R8 啟用後的安全保留規則 ──────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.shopify.reactnative.skia.** { *; }
-keep class expo.modules.** { *; }

# 保留所有 JNI native 方法，避免 R8 移除導致 UnsatisfiedLinkError
-keepclasseswithmembernames class * {
    native <methods>;
}
`;

  fs.writeFileSync(proguardPath, content, 'utf8');
  console.log('已更新 proguard-rules.pro');
}

if (!fs.existsSync(path.join(__dirname, '..', 'android'))) {
  console.error('找不到 android/ 資料夾，請先執行 npx expo prebuild');
  process.exit(1);
}

patchGradleProperties();
patchProguardRules();
