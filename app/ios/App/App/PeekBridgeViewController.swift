import UIKit
import Capacitor

/// The app's web view controller: registers Peek Pets' own native plugins.
class PeekBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PeekDiscoveryPlugin())
    }
}
