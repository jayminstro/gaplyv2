#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Define the plugin using the CAP_PLUGIN macro, which
// automatically creates the register function.
CAP_PLUGIN(CalendarBridgePlugin, "CalendarBridge",
    CAP_PLUGIN_METHOD(getPermissionStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestAccess, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(listCalendars, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(listEvents, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(test, CAPPluginReturnPromise);
)
