package br.com.nexobrasil.nexoplayer.firetv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/** The TV runs the actual online Player. There are no separate login/home/watch screens. */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var root: FrameLayout
    private var fullScreenView: View? = null
    private var fullScreenCallback: WebChromeClient.CustomViewCallback? = null
    private val trustedHosts = setOf("housemix.nexobrasil.net", "nexobrasil.net", "www.nexobrasil.net")
    private val startUrl get() = "${BuildConfig.PLAYER_ORIGIN}/${BuildConfig.STATION_SLUG}/player?tv=1"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        immersive()
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            overScrollMode = View.OVER_SCROLL_NEVER
            isHorizontalScrollBarEnabled = false
            isVerticalScrollBarEnabled = false
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                useWideViewPort = true
                loadWithOverviewMode = true
                textZoom = 100
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                userAgentString = userAgentString.replace(" Mobile", "") + " Android TV FireTV NexoPlayerTV/${BuildConfig.VERSION_NAME}"
            }
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url
                if (uri.scheme == "https" && uri.host in trustedHosts) return false
                if (request.hasGesture() && uri.scheme == "https") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (Uri.parse(url).host !in trustedHosts) return
                view.evaluateJavascript(assets.open("tv-remote.js").bufferedReader().use { it.readText() }, null)
                view.requestFocus()
                immersive()
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showConnectionError()
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullScreenView != null) { callback.onCustomViewHidden(); return }
                fullScreenView = view
                fullScreenCallback = callback
                root.addView(view, FrameLayout.LayoutParams(-1, -1))
                immersive()
            }
            override fun onHideCustomView() = hideFullScreen()
        }
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        webView.loadUrl(startUrl, mapOf("Cache-Control" to "no-cache"))
    }

    private fun immersive() { window.decorView.systemUiVisibility = 5894 or 1024 or 512 }
    private fun hideFullScreen() {
        fullScreenView?.let { root.removeView(it) }
        fullScreenView = null
        fullScreenCallback?.onCustomViewHidden()
        fullScreenCallback = null
        webView.requestFocus()
        immersive()
    }
    private fun showConnectionError() {
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(Color.BLACK)
        }
        panel.addView(TextView(this).apply { text = "Não foi possível carregar o Player. Verifique a conexão da TV."; setTextColor(Color.WHITE); textSize = 18f })
        panel.addView(Button(this).apply {
            text = "Tentar novamente"
            setOnClickListener { root.removeView(panel); webView.loadUrl(startUrl) }
        })
        root.addView(panel, FrameLayout.LayoutParams(-1, -1))
        panel.getChildAt(1).requestFocus()
    }
    @Deprecated("Android TV Back key")
    override fun onBackPressed() {
        if (fullScreenView != null) { hideFullScreen(); return }
        webView.evaluateJavascript("(function(){var e=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});return(document.activeElement||document.body).dispatchEvent(e)})()") { unhandled ->
            if (unhandled == "true") { if (webView.canGoBack()) webView.goBack() else finish() }
        }
    }
    override fun onResume() { super.onResume(); if (::webView.isInitialized) webView.onResume(); immersive() }
    override fun onPause() { if (::webView.isInitialized) webView.onPause(); super.onPause() }
    override fun onDestroy() { webView.destroy(); super.onDestroy() }
}
