import SwiftUI
import UIKit
import WidgetKit

// 앱(src/services/widgetSync.ts)이 App Group에 JSON으로 써 두는 결제 일정을 읽어
// 큰 것(한 달 달력)·중간(이번 주 + 다가오는 결제 두 줄)·작은 것(다음 결제)을 그린다.
// 색과 굵기는 앱 결제 캘린더(src/constants/theme.ts)와 맞춘다.

private let appGroup = "group.app.mysubflow"
private let storageKey = "widget"

// MARK: - 색 (앱 팔레트)

private extension Color {
  init(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    var v: UInt64 = 0
    Scanner(string: s).scanHexInt64(&v)
    self.init(
      red: Double((v >> 16) & 0xFF) / 255,
      green: Double((v >> 8) & 0xFF) / 255,
      blue: Double(v & 0xFF) / 255
    )
  }
  static let appText = Color(hex: "#374B5C")
  static let appSub = Color(hex: "#A2B4C5")
  static let appPrimary = Color(hex: "#4A90D9")
  static let appSoft = Color(hex: "#D6E8F7")
  static let appLine = Color(hex: "#F2F6F9")
  static let logoBg = Color(hex: "#F5F5F5")
}

// MARK: - 데이터

struct WEvent: Codable, Hashable {
  let d: String        // yyyy-MM-dd
  let n: String        // 서비스 이름
  let l: String?       // 로고 파일 키 (없으면 글자 타일)
  let f: Bool?         // 브랜드 바탕 로고 → 칸을 꽉 채움
  let bg: String?      // 글자 타일 바탕색
  let fg: String?      // 글자 타일 글자색
}

struct WPayload: Codable {
  let events: [WEvent]
  let totals: [String: String]  // 날짜 → 그날 결제 합계 문자열
  let lang: String?
}

private func loadPayload() -> WPayload? {
  guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: storageKey),
        let data = raw.data(using: .utf8) else { return nil }
  return try? JSONDecoder().decode(WPayload.self, from: data)
}

/// 위젯이 비어 있을 때 어디서 막혔는지 작게 보여 준다 (앱 그룹 / 데이터 / 해석)
private func diagnose() -> String {
  guard let defaults = UserDefaults(suiteName: appGroup) else { return "E1 group" }
  if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) == nil {
    return "E2 entitlement"
  }
  guard let obj = defaults.object(forKey: storageKey) else { return "E3 empty" }
  guard let raw = obj as? String, let data = raw.data(using: .utf8) else { return "E4 type" }
  do {
    _ = try JSONDecoder().decode(WPayload.self, from: data)
    return "ok"
  } catch {
    return "E5 \(String(describing: error).prefix(60))"
  }
}

private var cal: Calendar = {
  var c = Calendar(identifier: .gregorian)
  c.timeZone = .current
  return c
}()

private let dayFmt: DateFormatter = {
  let f = DateFormatter()
  f.calendar = Calendar(identifier: .gregorian)
  f.locale = Locale(identifier: "en_US_POSIX")
  f.timeZone = .current
  f.dateFormat = "yyyy-MM-dd"
  return f
}()

private func key(_ date: Date) -> String { dayFmt.string(from: date) }

struct Model {
  let today: Date
  let byDay: [String: [WEvent]]
  let totals: [String: String]
  let ko: Bool
  let hasData: Bool

  init(payload: WPayload?, today: Date) {
    self.today = cal.startOfDay(for: today)
    var map: [String: [WEvent]] = [:]
    for e in payload?.events ?? [] { map[e.d, default: []].append(e) }
    byDay = map
    totals = payload?.totals ?? [:]
    ko = (payload?.lang ?? "ko") != "en"
    hasData = payload != nil
  }

  func events(on date: Date) -> [WEvent] { byDay[key(date)] ?? [] }

  /// 오늘부터 가까운 결제일 (최대 count개)
  func upcomingDays(_ count: Int) -> [Date] {
    var out: [Date] = []
    for off in 0..<90 {
      guard let d = cal.date(byAdding: .day, value: off, to: today) else { continue }
      if !events(on: d).isEmpty { out.append(d) }
      if out.count == count { break }
    }
    return out
  }

  var weekdays: [String] {
    ko ? ["일", "월", "화", "수", "목", "금", "토"] : ["S", "M", "T", "W", "T", "F", "S"]
  }

  func whenLabel(_ d: Date) -> String {
    let off = cal.dateComponents([.day], from: today, to: d).day ?? 0
    // 날짜 대신 남은 날수: 오늘 / D-1 / D-7
    return off == 0 ? (ko ? "오늘" : "Today") : "D-\(off)"
  }

  func dday(_ d: Date) -> Int { cal.dateComponents([.day], from: today, to: d).day ?? 0 }
}

// MARK: - 타임라인

struct Entry: TimelineEntry {
  let date: Date
  let payload: WPayload?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: Date(), payload: sample) }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    // 위젯 고르는 화면에서는 데이터가 없으면 예시로 보여 준다
    completion(Entry(date: Date(), payload: loadPayload() ?? (context.isPreview ? sample : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    // '오늘' 표시가 넘어가도록 앞으로 7일 동안 자정마다 다시 그린다.
    // 구독이 바뀌면 앱이 reloadWidget으로 새로 그리게 한다.
    let payload = loadPayload()
    let now = Date()
    var entries = [Entry(date: now, payload: payload)]
    for i in 1...7 {
      if let d = cal.date(byAdding: .day, value: i, to: cal.startOfDay(for: now)) {
        entries.append(Entry(date: d, payload: payload))
      }
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }

  private var sample: WPayload {
    let t = cal.startOfDay(for: Date())
    func d(_ off: Int) -> String { key(cal.date(byAdding: .day, value: off, to: t)!) }
    return WPayload(
      events: [
        WEvent(d: d(1), n: "ChatGPT Plus", l: "chatgpt", f: false, bg: nil, fg: nil),
        WEvent(d: d(1), n: "Notion", l: "notion", f: false, bg: nil, fg: nil),
        WEvent(d: d(5), n: "Disney+", l: "disneyplus", f: true, bg: nil, fg: nil),
        WEvent(d: d(9), n: "Netflix", l: "netflix", f: false, bg: nil, fg: nil),
      ],
      totals: [d(1): "₩43,000", d(5): "₩9,900", d(9): "₩17,000"],
      lang: "ko"
    )
  }
}

// MARK: - 작은 조각들

struct LogoView: View {
  let e: WEvent
  let size: CGFloat

  var body: some View {
    let r = size * 0.26
    ZStack {
      if let l = e.l, let img = UIImage(named: "logo_\(l)") {
        RoundedRectangle(cornerRadius: r, style: .continuous).fill(Color.logoBg)
        Image(uiImage: img)
          .resizable()
          .scaledToFit()
          .frame(width: (e.f ?? false) ? size : size * 0.75, height: (e.f ?? false) ? size : size * 0.75)
      } else {
        RoundedRectangle(cornerRadius: r, style: .continuous).fill(Color(hex: e.bg ?? "#6B7D8E"))
        Text(String(e.n.prefix(1)).uppercased())
          .font(.system(size: size * 0.5, weight: .heavy))
          .foregroundColor(Color(hex: e.fg ?? "#FFFFFF"))
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: r, style: .continuous))
  }
}

struct MoreBadge: View {
  let n: Int
  let height: CGFloat
  var body: some View {
    Text("+\(n)")
      .font(.system(size: height * 0.6, weight: .heavy))
      .foregroundColor(.white)
      .padding(.horizontal, 3)
      .frame(minWidth: height, minHeight: height, maxHeight: height)
      .background(Capsule().fill(Color.appPrimary))
  }
}

/// 로고를 가로로 max개까지, 넘치면 +N
struct LogoRow: View {
  let events: [WEvent]
  let size: CGFloat
  let max: Int
  var body: some View {
    HStack(spacing: 2) {
      ForEach(Array(events.prefix(max).enumerated()), id: \.offset) { _, e in LogoView(e: e, size: size) }
      if events.count > max { MoreBadge(n: events.count - max, height: size) }
    }
  }
}

struct DayNumber: View {
  let day: Int
  let isToday: Bool
  let size: CGFloat
  var body: some View {
    Text("\(day)")
      .font(.system(size: size * 0.5, weight: .bold))
      .monospacedDigit()
      .foregroundColor(isToday ? .appPrimary : .appText)
      .frame(width: size, height: size)
      .background(Circle().fill(isToday ? Color.appSoft : .clear))
  }
}

// MARK: - 큰 것: 한 달 달력

struct LargeView: View {
  let m: Model

  var body: some View {
    let comps = cal.dateComponents([.year, .month], from: m.today)
    let first = cal.date(from: comps)!
    let days = cal.range(of: .day, in: .month, for: first)!.count
    let lead = cal.component(.weekday, from: first) - 1
    let cells: [Date?] = Array(repeating: nil, count: lead) + (0..<days).map { cal.date(byAdding: .day, value: $0, to: first) }
    let rows = Int(ceil(Double(cells.count) / 7))

    VStack(spacing: 6) {
      Text(m.ko ? "\(comps.month!)월" : first.formatted(.dateTime.month(.wide)))
        .font(.system(size: 16, weight: .bold))
        .foregroundColor(.appText)
      HStack(spacing: 0) {
        ForEach(0..<7, id: \.self) { i in
          Text(m.weekdays[i]).font(.system(size: 10, weight: .heavy)).foregroundColor(.appSub).frame(maxWidth: .infinity)
        }
      }
      VStack(spacing: 2) {
        ForEach(0..<rows, id: \.self) { r in
          HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { c in
              let i = r * 7 + c
              let date: Date? = i < cells.count ? cells[i] : nil
              VStack(spacing: 3) {
                if let date {
                  DayNumber(day: cal.component(.day, from: date), isToday: cal.isDate(date, inSameDayAs: m.today), size: 22)
                  LogoRow(events: m.events(on: date), size: 15, max: 2)
                } else {
                  Color.clear.frame(height: 22)
                }
              }
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
          }
        }
      }
    }
  }
}

// MARK: - 중간: 이번 주 + 다가오는 결제 두 줄

struct MediumView: View {
  let m: Model

  var body: some View {
    let start = cal.date(byAdding: .day, value: -(cal.component(.weekday, from: m.today) - 1), to: m.today)!
    let week = (0..<7).map { cal.date(byAdding: .day, value: $0, to: start)! }
    let weekEnd = cal.date(byAdding: .day, value: 7, to: start)!
    // 오늘부터 이번 주 토요일까지 가장 가까운 결제 하나
    let next = m.upcomingDays(1).filter { $0 < weekEnd }

    // 위아래로 꽉 채운다: 주간 달력은 위에 붙이고, 결제 목록은 아래로 내린다
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        ForEach(Array(week.enumerated()), id: \.offset) { i, d in
          VStack(spacing: 4) {
            Text(m.weekdays[i]).font(.system(size: 11, weight: .heavy)).foregroundColor(.appSub)
            DayNumber(day: cal.component(.day, from: d), isToday: cal.isDate(d, inSameDayAs: m.today), size: 30)
            LogoRow(events: m.events(on: d), size: 19, max: 2).frame(height: 19)
          }
          .frame(maxWidth: .infinity)
        }
      }
      Spacer(minLength: 6)
      Rectangle().fill(Color.appLine).frame(height: 1)
      Spacer(minLength: 6)
      VStack(spacing: 7) {
        if next.isEmpty {
          Text(m.ko ? "이번 주 남은 결제 없음" : "No more payments this week")
            .font(.system(size: 11.5, weight: .semibold)).foregroundColor(.appSub)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        ForEach(next, id: \.self) { d in
          let evs = m.events(on: d)
          let off = m.dday(d)
          HStack(spacing: 6) {
            Text(m.whenLabel(d))
              .font(.system(size: 12, weight: .heavy))
              .monospacedDigit()
              .foregroundColor(off <= 1 ? .appPrimary : .appSub)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
              .frame(width: 38, alignment: .leading)
            LogoRow(events: evs, size: 17, max: 2)
            Text(evs[0].n + (evs.count > 1 ? (m.ko ? " 외 \(evs.count - 1)건" : " +\(evs.count - 1)") : ""))
              .font(.system(size: 12.5, weight: .bold))
              .foregroundColor(.appText)
              .lineLimit(1)
            Spacer(minLength: 4)
            Text(m.totals[key(d)] ?? "")
              .font(.system(size: 12.5, weight: .bold))
              .monospacedDigit()
              .foregroundColor(.appText)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - 작은 것: 다음 결제

struct SmallView: View {
  let m: Model

  var body: some View {
    if let d = m.upcomingDays(1).first {
      let evs = m.events(on: d)
      VStack(alignment: .leading, spacing: 0) {
        Text(m.ko ? "다음 결제 · \(cal.component(.month, from: d))월 \(cal.component(.day, from: d))일" : "Next · \(cal.component(.month, from: d))/\(cal.component(.day, from: d))")
          .font(.system(size: 10.5, weight: .bold))
          .foregroundColor(.appSub)
        Spacer(minLength: 0)
        Text(m.dday(d) == 0 ? "D-Day" : "D-\(m.dday(d))")
          .font(.system(size: 36, weight: .heavy))
          .monospacedDigit()
          .foregroundColor(.appPrimary)
          .minimumScaleFactor(0.6)
        Spacer(minLength: 0)
        HStack(spacing: 4) {
          ForEach(Array(evs.prefix(3).enumerated()), id: \.offset) { _, e in LogoView(e: e, size: 20) }
          if evs.count > 3 { MoreBadge(n: evs.count - 3, height: 20) }
        }
        Text(m.totals[key(d)] ?? "")
          .font(.system(size: 16, weight: .bold))
          .monospacedDigit()
          .foregroundColor(.appText)
          .padding(.top, 6)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    } else {
      NoDataView(m: m)
    }
  }
}

/// SubFlow 공식 로고 (펜 글씨). 이미지가 없으면 글자로
struct BrandLogo: View {
  let height: CGFloat
  var body: some View {
    if let img = UIImage(named: "brand_logo") {
      Image(uiImage: img).resizable().scaledToFit().frame(height: height)
    } else {
      Text("SubFlow").font(.system(size: height * 0.55, weight: .heavy)).foregroundColor(.appPrimary)
    }
  }
}

struct NoDataView: View {
  let m: Model
  var body: some View {
    VStack(spacing: 8) {
      BrandLogo(height: 24)
      Text(m.hasData
           ? (m.ko ? "다가오는 결제가 없어요" : "No upcoming payments")
           : (m.ko ? "앱을 한 번 열면 결제일이 여기 보여요" : "Open the app once to see your payments"))
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(.appSub)
        .multilineTextAlignment(.center)
      if !m.hasData {
        Text(diagnose())
          .font(.system(size: 8, weight: .regular, design: .monospaced))
          .foregroundColor(.appSub.opacity(0.7))
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - 위젯

struct SubFlowWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var body: some View {
    let m = Model(payload: entry.payload, today: entry.date)
    Group {
      switch family {
      case .systemSmall: SmallView(m: m)
      case .systemMedium: m.hasData ? AnyView(MediumView(m: m)) : AnyView(NoDataView(m: m))
      default: m.hasData ? AnyView(LargeView(m: m)) : AnyView(NoDataView(m: m))
      }
    }
    // 아이폰은 위젯 바탕을 투명하게 만들 수 없어 앱 카드와 같은 흰색으로 둔다
    .containerBackground(Color.white, for: .widget)
    .widgetURL(URL(string: "subflow://calendar"))
  }
}

@main
struct SubFlowWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "SubFlowWidget", provider: Provider()) { entry in
      SubFlowWidgetView(entry: entry)
    }
    .configurationDisplayName("SubFlow 결제 캘린더")
    .description("구독 결제일을 홈 화면에서 바로 봐요.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
