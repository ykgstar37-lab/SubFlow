Pod::Spec.new do |s|
  s.name           = 'WidgetStorage'
  s.version        = '1.0.0'
  s.summary        = 'SubFlow 홈 화면 위젯에 결제 일정을 넘기는 App Group 저장소'
  s.description    = 'Writes JSON into the shared App Group UserDefaults and reloads WidgetKit timelines.'
  s.author         = 'SubFlow'
  s.homepage       = 'https://mysubflow.app'
  s.license        = 'MIT'
  # 앱 최소 버전(15.1)과 맞춘다. @bacons/apple-targets의 ExtensionStorage는 16.4라
  # 자동 연결에서 조용히 빠졌다.
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
