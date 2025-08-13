//
//  MainViewController.swift
//  App
//
//  Created by jay-miniMac on 12/08/2025.
//

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
  override func capacitorDidLoad() {
    print("🧩 Registering CalendarBridge")
    bridge?.registerPluginInstance(CalendarBridge())
  }
}
