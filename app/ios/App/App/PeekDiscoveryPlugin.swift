import Foundation
import Capacitor
import Network

/// Finds Peek Pets companions on the local Wi-Fi (Bonjour "_peekpets._tcp").
/// The companion puts its address and port in the TXT record, so no extra
/// resolving is needed. JS: Capacitor.Plugins.PeekDiscovery.browse({ timeout })
/// → { services: [{ name, pc, ip, port, ver, proto }] }.
/// The first browse shows iOS's "find devices on your local network" prompt.
@objc(PeekDiscoveryPlugin)
public class PeekDiscoveryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PeekDiscoveryPlugin"
    public let jsName = "PeekDiscovery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "browse", returnType: CAPPluginReturnPromise)
    ]

    private var browser: NWBrowser?

    @objc func browse(_ call: CAPPluginCall) {
        let seconds = min(max(call.getDouble("timeout") ?? 2500, 500), 10000) / 1000.0
        DispatchQueue.main.async {
            self.browser?.cancel()
            let parameters = NWParameters()
            parameters.includePeerToPeer = false
            let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_peekpets._tcp", domain: nil), using: parameters)
            var found: [String: [String: String]] = [:]

            browser.browseResultsChangedHandler = { results, _ in
                for result in results {
                    guard case let .service(name, _, _, _) = result.endpoint else { continue }
                    var entry: [String: String] = ["name": name]
                    if case let .bonjour(txt) = result.metadata {
                        for key in ["pc", "ip", "port", "ver", "proto"] {
                            if let value = txt[key] { entry[key] = value }
                        }
                    }
                    found[name] = entry
                }
            }
            browser.stateUpdateHandler = { state in
                if case .failed = state { browser.cancel() }
            }
            self.browser = browser
            browser.start(queue: .main)

            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
                browser.cancel()
                if self?.browser === browser { self?.browser = nil }
                call.resolve(["services": Array(found.values)])
            }
        }
    }
}
