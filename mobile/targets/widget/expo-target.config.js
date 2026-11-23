// 홈 화면 위젯 (WidgetKit). 앱이 App Group에 결제 일정을 써 두면 위젯이 읽어서 그린다.
const fs = require("fs");
const path = require("path");

// 앱과 같은 서비스 로고를 위젯 안에도 넣는다 (logo_<파일 이름>)
const logoDir = path.join(__dirname, "../../assets/logos");
const images = {};
for (const file of fs.readdirSync(logoDir)) {
  if (file.endsWith(".png")) images[`logo_${file.replace(/\.png$/, "")}`] = `../../assets/logos/${file}`;
}
// SubFlow 공식 로고 (펜 글씨)
images.brand_logo = "../../assets/brand/subflow-logo-pen.png";

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "SubFlowWidget",
  displayName: "SubFlow",
  bundleIdentifier: ".widget",
  // containerBackground 등 위젯 API가 17부터라 그 아래 기기에는 위젯이 안 보인다
  deploymentTarget: "17.0",
  colors: {
    $accent: "#4A90D9",
    $widgetBackground: "#FFFFFF",
  },
  images,
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
