import Foundation
import EventKit
import Capacitor

@objc(CalendarBridgePlugin)
public class CalendarBridgePlugin: CAPPlugin {
    private let eventStore = EKEventStore()
    
    @objc func getPermissionStatus(_ call: CAPPluginCall) {
        let status = EKEventStore.authorizationStatus(for: .event)
        
        let statusString: String
        switch status {
        case .notDetermined:
            statusString = "not_determined"
        case .restricted:
            statusString = "restricted"
        case .denied:
            statusString = "denied"
        case .authorized:
            statusString = "granted"
        case .fullAccess:
            statusString = "granted"
        case .writeOnly:
            statusString = "denied"
        @unknown default:
            statusString = "not_determined"
        }
        
        call.resolve([
            "status": statusString
        ])
    }
    
    @objc func requestAccess(_ call: CAPPluginCall) {
        eventStore.requestAccess(to: .event) { granted, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("Failed to request calendar access: \(error.localizedDescription)")
                    return
                }
                
                call.resolve([
                    "granted": granted
                ])
            }
        }
    }
    
    @objc func listCalendars(_ call: CAPPluginCall) {
        let status = EKEventStore.authorizationStatus(for: .event)
        
        guard status == .authorized || status == .fullAccess else {
            call.reject("Calendar permission not granted. Current status: \(status.rawValue)")
            return
        }
        
        let calendars = eventStore.calendars(for: .event)
        let calendarData = calendars.map { calendar -> [String: Any] in
            return [
                "id": calendar.calendarIdentifier,
                "title": calendar.title,
                "colorHex": "#007AFF", // Simplified color for now
                "isSubscribed": calendar.isSubscribed,
                "allowsModifications": calendar.allowsContentModifications
            ]
        }
        
        call.resolve([
            "calendars": calendarData
        ])
    }
    
    @objc func listEvents(_ call: CAPPluginCall) {
        let status = EKEventStore.authorizationStatus(for: .event)
        
        guard status == .authorized || status == .fullAccess else {
            call.reject("Calendar permission not granted. Current status: \(status.rawValue)")
            return
        }
        
        guard let startISO = call.getString("startISO"),
              let endISO = call.getString("endISO") else {
            call.reject("startISO and endISO are required")
            return
        }
        
        let calendarIds = call.getArray("calendarIds", String.self) ?? []
        
        // Parse ISO dates
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        guard let startDate = dateFormatter.date(from: startISO),
              let endDate = dateFormatter.date(from: endISO) else {
            call.reject("Invalid date format. Expected ISO8601 format.")
            return
        }
        
        // Create predicate
        var predicate: NSPredicate
        if calendarIds.isEmpty {
            predicate = eventStore.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
        } else {
            let calendars = calendarIds.compactMap { eventStore.calendar(withIdentifier: $0) }
            predicate = eventStore.predicateForEvents(withStart: startDate, end: endDate, calendars: calendars)
        }
        
        // Fetch events
        let events = eventStore.events(matching: predicate)
        
        // Convert to bridge format
        let eventData = events.map { event -> [String: Any] in
            let localFormatter = DateFormatter()
            localFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
            localFormatter.timeZone = TimeZone.current
            
            let dateOnlyFormatter = DateFormatter()
            dateOnlyFormatter.dateFormat = "yyyy-MM-dd"
            dateOnlyFormatter.timeZone = TimeZone.current
            
            return [
                "id": event.eventIdentifier as Any,
                "calendarId": event.calendar.calendarIdentifier,
                "calendarTitle": event.calendar.title,
                "icalUID": (event.calendarItemExternalIdentifier ?? event.eventIdentifier) as Any,
                "allDay": event.isAllDay,
                "startLocalISO": localFormatter.string(from: event.startDate),
                "endLocalISO": localFormatter.string(from: event.endDate),
                "dateLocal": dateOnlyFormatter.string(from: event.startDate)
            ]
        }
        
        call.resolve([
            "events": eventData
        ])
    }
}
