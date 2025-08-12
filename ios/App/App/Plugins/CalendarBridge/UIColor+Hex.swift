import UIKit

extension UIColor {
  func toHexString() -> String {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    getRed(&r, green: &g, blue: &b, alpha: &a)
    let ri = Int(round(r * 255)), gi = Int(round(g * 255)), bi = Int(round(b * 255))
    return String(format: "#%02X%02X%02X", ri, gi, bi)
  }
}
