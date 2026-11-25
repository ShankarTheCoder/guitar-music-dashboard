package com.guitarplay.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val home = Uri.parse(BuildConfig.GUITARPLAY_URL)
                val url = request.url
                if (request.isForMainFrame && url.scheme == home.scheme && url.authority == home.authority &&
                    url.path == "/connect-in-browser") {
                    startActivity(Intent(Intent.ACTION_VIEW, home))
                    return true
                }
                return false
            }
        }
        webView.webChromeClient = WebChromeClient()
        webView.loadUrl(BuildConfig.GUITARPLAY_URL)
        setContentView(webView)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
