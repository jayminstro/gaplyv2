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
    CAPPluginMethod(name: "openEventInCalendar", returnType: CAPPluginReturnPromise),
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
        "id": event.calendarItemIdentifier ?? "",
        "calendarId": event.calendar.calendarIdentifier,
        "title": event.title ?? "",
        "start": event.startDate.timeIntervalSince1970 * 1000,
        "end": event.endDate.timeIntervalSince1970 * 1000,
        "isAllDay": event.isAllDay
      ]
      
      // Add organizer information
      if let organizer = event.organizer {
        eventData["organizer"] = [
          "name": organizer.name ?? "",
          "email": organizer.url.absoluteString
        ]
      }
      
      // Add attendees information
      if let attendees = event.attendees, !attendees.isEmpty {
        let attendeesData = attendees.map { attendee -> [String: Any] in
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
      }
      
      // Add location
      if let location = event.location, !location.isEmpty {
        eventData["location"] = location as String
      }
      
      // Add notes
      if let notes = event.notes, !notes.isEmpty {
        eventData["notes"] = notes as String
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
      
          // Debug: Print event identifier for comparison
    print("🔧 CalendarBridge Debug - Event '\(event.title ?? "No title")' has identifier: \(event.calendarItemIdentifier ?? "nil")")
      
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

  @objc func openEventInCalendar(_ call: CAPPluginCall) {
    guard let eventId = call.getString("eventId") else {
      call.reject("Event ID is required")
      return
    }
    
    print("🔧 CalendarBridge Debug - Attempting to open event with ID: \(eventId)")
    print("🔧 CalendarBridge Debug - EventId type: \(type(of: eventId)), length: \(eventId.count)")
    print("🔧 CalendarBridge Debug - EventId contains only alphanumeric/dashes: \(eventId.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil)")
    print("🔧 CalendarBridge Debug - EventId trimmed: '\(eventId.trimmingCharacters(in: .whitespacesAndNewlines))'")
    print("🔧 CalendarBridge Debug - EventId is empty: \(eventId.isEmpty)")
    
    // Use the SAME store instance that was used in getEvents() to ensure identifier consistency
    print("🔧 CalendarBridge Debug - Using class-level store instance for consistency")
    
    // Check authorization status
    let authStatus = EKEventStore.authorizationStatus(for: .event)
    print("🔧 CalendarBridge Debug - Authorization status: \(authStatus.rawValue)")
    
    // If not authorized, request authorization
    if authStatus == .notDetermined {
      print("🔧 CalendarBridge Debug - Requesting calendar authorization")
      if #available(iOS 17.0, *) {
        store.requestFullAccessToEvents { granted, error in
          if granted {
            print("🔧 CalendarBridge Debug - Authorization granted, proceeding with event lookup")
            self.performEventLookup(eventId: eventId, store: self.store, call: call)
          } else {
            print("🔧 CalendarBridge Debug - Authorization denied: \(error?.localizedDescription ?? "Unknown error")")
            call.reject("Calendar access denied")
          }
        }
      } else {
        store.requestAccess(to: .event) { granted, error in
          if granted {
            print("🔧 CalendarBridge Debug - Authorization granted, proceeding with event lookup")
            self.performEventLookup(eventId: eventId, store: self.store, call: call)
          } else {
            print("🔧 CalendarBridge Debug - Authorization denied: \(error?.localizedDescription ?? "Unknown error")")
            call.reject("Calendar access denied")
          }
        }
      }
    } else if (authStatus == .authorized) || (authStatus == .fullAccess) {
      print("🔧 CalendarBridge Debug - Already authorized, proceeding with event lookup")
      // Use the same store instance directly
      self.performEventLookup(eventId: eventId, store: self.store, call: call)
    } else {
      print("🔧 CalendarBridge Debug - Calendar access not available: \(authStatus.rawValue)")
      call.reject("Calendar access not available")
    }
  }
  
  private func performEventLookup(eventId: String, store: EKEventStore, call: CAPPluginCall) {
    print("🔧 CalendarBridge Debug - Using store instance: \(store)")
    
    // Try multiple approaches to find the event since EventKit can be finicky
    var foundEvent: EKEvent?
    
    // Method 1: Try event(withIdentifier:) - this might work for eventIdentifier but not calendarItemIdentifier
    if let event = store.event(withIdentifier: eventId) {
      foundEvent = event
      print("🔧 CalendarBridge Debug - Found event using event(withIdentifier:)")
    }
    
    // Method 2: If not found, try searching with a predicate (fallback)
    if foundEvent == nil {
      print("🔧 CalendarBridge Debug - Trying predicate-based search as fallback...")
      let startDate = Calendar.current.date(byAdding: .year, value: -2, to: Date()) ?? Date.distantPast
      let endDate = Calendar.current.date(byAdding: .year, value: 2, to: Date()) ?? Date.distantFuture
      let predicate = store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
      let events = store.events(matching: predicate)
      
      print("🔧 CalendarBridge Debug - Predicate search found \(events.count) events")
      
      // Look for exact match by calendarItemIdentifier first (this is what we send from getEvents)
      foundEvent = events.first(where: { $0.calendarItemIdentifier == eventId })
      if foundEvent != nil {
        print("🔧 CalendarBridge Debug - Found event using calendarItemIdentifier match")
      }
      
      // If still not found, try eventIdentifier as last resort
      if foundEvent == nil {
        foundEvent = events.first(where: { $0.eventIdentifier == eventId })
        if foundEvent != nil {
          print("🔧 CalendarBridge Debug - Found event using eventIdentifier fallback")
        }
      }
      
      // Debug: Print a few event IDs to help troubleshoot
      if foundEvent == nil {
        print("🔧 CalendarBridge Debug - First 5 events from predicate search:")
        for (index, event) in events.prefix(5).enumerated() {
          print("🔧 CalendarBridge Debug - Event \(index): '\(event.title ?? "No title")' - calendarItemID: \(event.calendarItemIdentifier ?? "nil") - eventID: \(event.eventIdentifier)")
        }
      }
    }
    
    if let event = foundEvent {
      print("🔧 CalendarBridge Debug - Found event: '\(event.title ?? "No title")'")
      print("🔧 CalendarBridge Debug - Event calendarItemIdentifier: \(event.calendarItemIdentifier ?? "nil")")
      print("🔧 CalendarBridge Debug - Event eventIdentifier: \(event.eventIdentifier)")
      
      // Try to open the event using its URL if available
      if let eventURL = event.url {
        print("🔧 CalendarBridge Debug - Opening event using event.url: \(eventURL)")
        
        // Validate the URL before attempting to open it
        guard eventURL.scheme != nil, eventURL.host != nil else {
          print("🔧 CalendarBridge Debug - Event URL appears invalid, using calshow:// fallback")
          // Fallback to calshow:// if URL is malformed
          if let calshowURL = URL(string: "calshow://") {
            DispatchQueue.main.async {
              UIApplication.shared.open(calshowURL) { success in
                call.resolve(["success": success, "method": "calshow_invalid_url_fallback"])
              }
            }
          } else {
            call.reject("Failed to open calendar")
          }
          return
        }
        
        DispatchQueue.main.async {
          UIApplication.shared.open(eventURL) { success in
            if success {
              print("🔧 CalendarBridge Debug - Successfully opened event URL")
              call.resolve(["success": true, "method": "event_url"])
            } else {
              print("🔧 CalendarBridge Debug - Failed to open event URL, trying calshow://")
              // Fallback to calshow://
              if let calshowURL = URL(string: "calshow://") {
                UIApplication.shared.open(calshowURL) { success in
                  call.resolve(["success": success, "method": "calshow_fallback"])
                }
              } else {
                // Last resort: try to open the default calendar app
                print("🔧 CalendarBridge Debug - calshow:// failed, trying default calendar app")
                call.resolve(["success": false, "method": "no_calendar_app_found"])
              }
            }
          }
        }
      } else {
        print("🔧 CalendarBridge Debug - No event URL, using calshow:// fallback")
        // Fallback to opening the calendar app
        if let calshowURL = URL(string: "calshow://") {
          DispatchQueue.main.async {
            UIApplication.shared.open(calshowURL) { success in
              call.resolve(["success": success, "method": "calshow_only"])
            }
          }
        } else {
          // Last resort: try to open the default calendar app
          print("🔧 CalendarBridge Debug - calshow:// failed, trying default calendar app")
          call.resolve(["success": false, "method": "no_calendar_app_found"])
        }
      }
    } else {
      print("🔧 CalendarBridge Debug - Event not found with ID: \(eventId)")
      print("🔧 CalendarBridge Debug - This suggests the event ID is not from this store instance")
      print("🔧 CalendarBridge Debug - Possible reasons:")
      print("🔧 CalendarBridge Debug - 1. Event was deleted from calendar")
      print("🔧 CalendarBridge Debug - 2. Event ID format mismatch")
      print("🔧 CalendarBridge Debug - 3. Calendar permissions changed")
      print("🔧 CalendarBridge Debug - 4. Event is from a different calendar source")
      call.reject("Event not found with ID: \(eventId)")
      return
    }
  }
}
