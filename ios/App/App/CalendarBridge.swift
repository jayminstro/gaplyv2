import Foundation
import EventKit
import Capacitor
import UIKit

@objc(CalendarBridgePlugin)
public class CalendarBridgePlugin: CAPPlugin {
    private let eventStore = EKEventStore()
    
    override public func load() {
        CAPLog.print("📅 CalendarBridge loaded - Plugin is now active!")
        CAPLog.print("📅 CalendarBridge - Available methods: getPermissionStatus, requestAccess, listCalendars, listEvents")
        
        // Test if we can access EventKit
        let status = EKEventStore.authorizationStatus(for: .event)
        CAPLog.print("📅 CalendarBridge - Current EventKit authorization status: \(status.rawValue)")
    }
    
    override public init(bridge: CAPBridgeProtocol, pluginId: String, pluginName: String) {
        super.init(bridge: bridge, pluginId: pluginId, pluginName: pluginName)
        CAPLog.print("📅 CalendarBridge initialized with pluginId: \(pluginId), pluginName: \(pluginName)")
        CAPLog.print("📅 CalendarBridge - Bridge object: \(bridge)")
    }
    
    @objc func getPermissionStatus(_ call: CAPPluginCall) {
        // iOS 18 compatible authorization check
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
        
        CAPLog.print("📅 CalendarBridge - Authorization status: \(statusString) (raw: \(status.rawValue))")
        
        call.resolve([
            "status": statusString
        ])
    }
    
    @objc func requestAccess(_ call: CAPPluginCall) {
        // iOS 18 compatible permission request
        eventStore.requestAccess(to: .event) { granted, error in
            DispatchQueue.main.async {
                if let error = error {
                    CAPLog.print("📅 CalendarBridge - Permission request failed: \(error.localizedDescription)")
                    call.reject("Failed to request calendar access: \(error.localizedDescription)")
                    return
                }
                
                CAPLog.print("📅 CalendarBridge - Permission request result: \(granted)")
                call.resolve([
                    "granted": granted
                ])
            }
        }
    }
    
    @objc func listCalendars(_ call: CAPPluginCall) {
        // iOS 18 compatible calendar listing
        let status = EKEventStore.authorizationStatus(for: .event)
        
        let hasPermission = status == .authorized || status == .fullAccess
        
        guard hasPermission else {
            CAPLog.print("📅 CalendarBridge - No permission for listing calendars. Status: \(status.rawValue)")
            call.reject("Calendar permission not granted. Current status: \(status.rawValue)")
            return
        }
        
        let calendars = eventStore.calendars(for: .event)
        CAPLog.print("📅 CalendarBridge - Found \(calendars.count) calendars")
        
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
        // iOS 18 compatible event listing
        let status = EKEventStore.authorizationStatus(for: .event)
        
        let hasPermission = status == .authorized || status == .fullAccess
        
        guard hasPermission else {
            CAPLog.print("📅 CalendarBridge - No permission for listing events. Status: \(status.rawValue)")
            call.reject("Calendar permission not granted. Current status: \(status.rawValue)")
            return
        }
        
        guard let startISO = call.getString("startISO"),
              let endISO = call.getString("endISO") else {
            call.reject("startISO and endISO are required")
            return
        }
        
        // iOS 18 compatible date parsing
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        guard let startDate = dateFormatter.date(from: startISO),
              let endDate = dateFormatter.date(from: endISO) else {
            call.reject("Invalid date format. Use ISO8601 format")
            return
        }
        
        let calendarIds = call.getArray("calendarIds", String.self) ?? []
        
        // iOS 18 compatible event predicate
        let predicate = eventStore.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
        let events = eventStore.events(matching: predicate)
        
        CAPLog.print("📅 CalendarBridge - Found \(events.count) events between \(startDate) and \(endDate)")
        
        let eventData = events.compactMap { event -> [String: Any]? in
            // Filter by calendar IDs if specified
            if !calendarIds.isEmpty && !calendarIds.contains(event.calendar.calendarIdentifier) {
                return nil
            }
            
            // iOS 18 compatible date formatting
            let localDateFormatter = DateFormatter()
            localDateFormatter.dateFormat = "yyyy-MM-dd"
            localDateFormatter.timeZone = TimeZone.current
            
            let localISOFormatter = ISO8601DateFormatter()
            localISOFormatter.formatOptions = [.withInternetDateTime]
            
            return [
                "id": event.eventIdentifier,
                "calendarId": event.calendar.calendarIdentifier,
                "calendarTitle": event.calendar.title,
                "icalUID": event.calendarItemExternalIdentifier ?? event.eventIdentifier,
                "allDay": event.isAllDay,
                "startLocalISO": localISOFormatter.string(from: event.startDate),
                "endLocalISO": localISOFormatter.string(from: event.endDate),
                "dateLocal": localDateFormatter.string(from: event.startDate)
            ]
        }
        
        call.resolve([
            "events": eventData
        ])
    }
    
    @objc func test(_ call: CAPPluginCall) {
        CAPLog.print("📅 CalendarBridge test method called successfully!")
        call.resolve([
            "message": "CalendarBridge is working on iOS 18!",
            "timestamp": Date().timeIntervalSince1970,
            "iosVersion": UIDevice.current.systemVersion
        ])
    }
}
