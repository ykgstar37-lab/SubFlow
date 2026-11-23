import ExpoModulesCore
import WidgetKit

/// 앱 → 홈 화면 위젯. App Group UserDefaults에 문자열을 써 두고 위젯을 다시 그리게 한다.
/// 위젯(targets/widget/SubFlowWidget.swift)은 같은 그룹·키에서 읽는다.
public class WidgetStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetStorage")

    Function("setString") { (key: String, value: String, group: String) -> Bool in
      guard let defaults = UserDefaults(suiteName: group) else { return false }
      defaults.set(value, forKey: key)
      return true
    }

    /// App Group 컨테이너에 접근할 수 있는지 (앱에 그룹 권한이 붙었는지)
    Function("hasGroup") { (group: String) -> Bool in
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil
    }

    Function("reloadWidgets") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
