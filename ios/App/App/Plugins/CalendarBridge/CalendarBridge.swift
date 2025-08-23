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
    CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getCalendars", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getEvents", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise)
  ]
  // --------------------------------

  private let store = EKEventStore()
  private var observer: NSObjectProtocol?
  private let isoWithMillis: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()
  private let isoNoMillis: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  public override func load() {
    observer = NotificationCenter.default.addObserver(
      forName: .EKEventStoreChanged,
      object: store,
      queue: .main
    ) { [weak self] _ in
      self?.notifyListeners("eventStoreChanged", data: [:])
    }
  }

  @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
    if #available(iOS 17.0, *) {
      let s = EKEventStore.authorizationStatus(for: .event)
      let result: String
      switch s {
        case .fullAccess:    result = "fullAccess"
        case .writeOnly:     result = "writeOnly"
        case .denied:        result = "denied"
        case .restricted:    result = "restricted"
        case .notDetermined: result = "notDetermined"
        @unknown default:    result = "unknown"
      }
      call.resolve(["status": result])
    } else {
      let s = EKEventStore.authorizationStatus(for: .event)
      let result: String
      switch s {
        case .authorized:    result = "authorized" // pre‑iOS 17
        case .denied:        result = "denied"
        case .restricted:    result = "restricted"
        case .notDetermined: result = "notDetermined"
        @unknown default:    result = "unknown"
      }
      call.resolve(["status": result])
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
    guard let startISO = call.getString("start"), let endISO = call.getString("end") else {
      call.reject("Invalid or missing start/end"); return
    }

    let start = isoWithMillis.date(from: startISO) ?? isoNoMillis.date(from: startISO)
    let end = isoWithMillis.date(from: endISO) ?? isoNoMillis.date(from: endISO)

    guard let s = start, let e = end else { call.reject("Invalid or missing start/end"); return }

    let ids = call.getArray("calendarIds", String.self) ?? []
    let calendars = store.calendars(for: .event).filter { ids.isEmpty || ids.contains($0.calendarIdentifier) }

    let predicate = store.predicateForEvents(withStart: s, end: e, calendars: calendars)
    let events = store.events(matching: predicate)

    let payload: [[String: Any]] = events.map { event in
      var eventData: [String: Any] = [
        "id": event.eventIdentifier,
        "calendarId": event.calendar.calendarIdentifier,
        "title": event.title ?? "",
        "start": event.startDate.timeIntervalSince1970 * 1000,
        "end": event.endDate.timeIntervalSince1970 * 1000,
        "isAllDay": event.isAllDay
      ]
      
      // Add organizer information
      print("🔧 CalendarBridge Debug - Event: \(event.title ?? "No title")")
      print("🔧 CalendarBridge Debug - Has organizer: \(event.organizer != nil)")
      if let organizer = event.organizer {
        print("🔧 CalendarBridge Debug - Organizer name: \(organizer.name ?? "No name")")
        print("🔧 CalendarBridge Debug - Organizer URL: \(organizer.url.absoluteString)")
        eventData["organizer"] = [
          "name": organizer.name ?? "",
          "email": organizer.url.absoluteString
        ]
      } else {
        print("🔧 CalendarBridge Debug - No organizer found")
      }
      
      // Add attendees information
      print("🔧 CalendarBridge Debug - Has attendees: \(event.attendees != nil)")
      if let attendees = event.attendees {
        print("🔧 CalendarBridge Debug - Attendees count: \(attendees.count)")
        if !attendees.isEmpty {
          let attendeesData = attendees.map { attendee -> [String: Any] in
            print("🔧 CalendarBridge Debug - Attendee: \(attendee.name ?? "No name") - \(attendee.url.absoluteString)")
            var attendeeData: [String: Any] = [
              "email": attendee.url.absoluteString,
              "name": attendee.name ?? "",
              "isOrganizer": attendee.isCurrentUser
            ]
            
            // Map response status
            let status: String
            switch attendee.participantStatus {
            case .accepted: status = "accepted"
            case .declined: status = "declined"
            case .tentative: status = "tentative"
            case .pending: status = "needsAction"
            @unknown default: status = "needsAction"
            }
            attendeeData["responseStatus"] = status
            
            return attendeeData
          }
          eventData["attendees"] = attendeesData
        } else {
          print("🔧 CalendarBridge Debug - Attendees array is empty")
        }
      } else {
        print("🔧 CalendarBridge Debug - No attendees found")
      }
      
      // Add location
      if let location = event.location, !location.isEmpty {
        eventData["location"] = location
      }
      
      // Add notes
      if let notes = event.notes, !notes.isEmpty {
        eventData["notes"] = notes
      }
      
      // Add URL
      if let url = event.url {
        eventData["url"] = url.absoluteString
      }
      
      // Add transparency
      let transparency: String = event.availability == .free ? "transparent" : "opaque"
      eventData["transparency"] = transparency
      
      // Add status
      let status: String
      switch event.status {
      case .none: status = "none"
      case .confirmed: status = "confirmed"
      case .tentative: status = "tentative"
      case .canceled: status = "cancelled"
      @unknown default: status = "none"
      }
      eventData["status"] = status
      
      // Add recurrence rules
      if let recurrenceRules = event.recurrenceRules, !recurrenceRules.isEmpty {
        let ruleStrings = recurrenceRules.map { rule in
          rule.description
        }
        eventData["recurrenceRules"] = ruleStrings
      }
      
      // Add dates
      if let lastModified = event.lastModifiedDate {
        eventData["lastModifiedDate"] = lastModified.timeIntervalSince1970 * 1000
      }
      if let creationDate = event.creationDate {
        eventData["creationDate"] = creationDate.timeIntervalSince1970 * 1000
      }
      
      // Add conference data (iOS 15+) - simplified to avoid compatibility issues
      // Note: Conference data availability varies by iOS version and calendar type
      // For now, we'll focus on the core calendar data that's more reliable
      
      print("🔧 CalendarBridge Debug - Final eventData for \(event.title ?? "No title"): \(eventData)")
      
      return eventData
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
