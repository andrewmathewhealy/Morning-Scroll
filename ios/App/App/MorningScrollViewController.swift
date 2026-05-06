import UIKit
import WebKit
import Capacitor

class MorningScrollViewController: CAPBridgeViewController {
    override func webViewConfiguration(for config: InstanceConfiguration) -> WKWebViewConfiguration {
        let webConfig = super.webViewConfiguration(for: config)
        webConfig.allowsInlineMediaPlayback = true
        webConfig.mediaTypesRequiringUserActionForPlayback = []
        return webConfig
    }
}
