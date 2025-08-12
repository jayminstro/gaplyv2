import Foundation
import Capacitor
import EventKit
import UIKit

@objc(CalendarBridge)
public class CalendarBridge: CAPPlugin, CAPBridgedPlugin {
  // ---- Capacitor v7 bridging ----
  public let identifier = "CalendarBridge"
  public let jsName = "CalendarBridge"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getCalendars", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getEvents", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise)
  ]
  // --------------------------------

  private let store = EKEventStore()
  private var observer: NSObjectProtocol?

  public override func load() {
    observer = NotificationCenter.default.addObserver(
      forName: .EKEventStoreChanged,
      object: store,
      queue: .main
    ) { [weak self] _ in
      self?.notifyListeners("eventStoreChanged", data: [:])
    }
  }

  deinit {
    if let obs = observer { NotificationCenter.default.removeObserver(obs) }
  }

  @objc func requestPermission(_ call: CAPPluginCall) {
    if #available(iOS 17.0, *) {
      store.requestFullAccessToEvents { granted, error in
        if let error = error { call.reject(error.localizedDescription); return }
        call.resolve(["status": granted ? "granted" : "denied"])}
    } else {
      store.requestAccess(to: .event) { granted, error in
        if let error = error { call.reject(error.localizedDescription); return }
        call.resolve(["status": granted ? "granted" : "denied"]) }
    }
  }

  @objc func getCalendars(_ call: CAPPluginCall) {
    let cals = store.calendars(for: .event).map { cal -> [String: Any] in
      let color = UIColor(cgColor: cal.cgColor).toHexString()
      let typeStr: String = {
        switch cal.type {
          case .local: return "Local"
          case .calDAV: return "CalDAV"
          case .exchange: return "Exchange"
          case .subscription: return "Subscribed"
          case .birthday: return "Birthday"
          @unknown default: return "Other"
        }
      }()
      return [
        "id": cal.calendarIdentifier,
        "title": cal.title,
        "color": color,
        "type": typeStr,
        "allowsModifications": cal.allowsContentModifications
      ]
    }
    call.resolve(["calendars": cals])
  }

  @objc func getEvents(_ call: CAPPluginCall) {
    guard
      let startISO = call.getString("start"),
      let endISO = call.getString("end"),
      let start = ISO8601DateFormatter().date(from: startISO),
      let end = ISO8601DateFormatter().date(from: endISO)
    else { call.reject("Invalid or missing start/end"); return }

    let ids = call.getArray("calendarIds", String.self) ?? []
    let calendars = store.calendars(for: .event).filter { ids.isEmpty || ids.contains($0.calendarIdentifier) }

    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
    let events = store.events(matching: predicate)

    let payload: [[String: Any]] = events.map { e in
      [
        "id": e.eventIdentifier,
        "calendarId": e.calendar.calendarIdentifier,
        "title": e.title ?? "",
        "start": e.startDate.timeIntervalSince1970 * 1000,
        "end": e.endDate.timeIntervalSince1970 * 1000,
        "isAllDay": e.isAllDay
      ]
    }
    call.resolve(["events": payload])
  }

  @objc func openSettings(_ call: CAPPluginCall) {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { call.reject("Cannot open settings"); return }
    DispatchQueue.main.async { UIApplication.shared.open(url, options: [:]) { _ in call.resolve() } }
  }

  @objc func ping(_ call: CAPPluginCall) { 
    call.resolve(["ok": true]) 
  }
}
