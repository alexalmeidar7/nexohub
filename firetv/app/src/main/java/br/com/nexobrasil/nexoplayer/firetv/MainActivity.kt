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
import android.webkit.RenderProcessGoneDetail
import android.os.Build
import android.util.Log
import android.widget.ImageView
import android.util.TypedValue
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
    // Package identity is authoritative; never reuse a different flavor's slug.
    private val stationSlug get() = when(packageName) {
        "br.com.nexobrasil.nexoplayer.positiva" -> "positivafm"
        "br.com.nexobrasil.nexoplayer.interativa" -> "interativafm"
        else -> BuildConfig.STATION_SLUG
    }
    private val startUrl get() = "${BuildConfig.PLAYER_ORIGIN}/${stationSlug}/player?tv=1" +
        (if (BuildConfig.DEBUG && intent.getBooleanExtra("nexo_preview", false)) "&tvGuest=1&step=home" else "")

    private fun isPlayerOrigin(uri: Uri): Boolean =
        (BuildConfig.DEBUG && uri.scheme == "http" && uri.host == "127.0.0.1" && uri.port == 8080) ||
        (!BuildConfig.DEBUG && uri.scheme == "https" && uri.host in trustedHosts)

    private var pageFinished = false
    private var startupFailed = false
    private var errorPanel: LinearLayout? = null
    private var rendererRetries = 0
    private var startupCover: FrameLayout? = null
    private val startupHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private fun showStartupCover() {
        val cover = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); isClickable = true }
        val logo = ImageView(this).apply { setImageResource(if (stationSlug == "positivafm") R.drawable.nexo_startup_logo_color_v19 else R.drawable.nexo_startup_logo); scaleType = ImageView.ScaleType.FIT_CENTER }
        val label = TextView(this).apply { text = "carregando sua experiência ..."; setTextColor(Color.WHITE); gravity = android.view.Gravity.CENTER }
        val footer = TextView(this).apply { text = "desenvolvido por Nexo Brasil - Copyrighted 2026/2027"; setTextColor(Color.WHITE); alpha = .5f; gravity = android.view.Gravity.CENTER }
        cover.addView(logo); cover.addView(label); cover.addView(footer)
        listOf(logo,label,footer).forEachIndexed { i, v -> val target=if(i==2) .5f else 1f; v.alpha=0f; v.translationY=12f; v.animate().alpha(target).translationY(0f).setStartDelay(i*110L).setDuration(650).start() }
        cover.addOnLayoutChangeListener { _, l,t,r,b,_,_,_,_ ->
            val w=r-l; val h=b-t
            if(w>0 && h>0) {
                fun place(v:View, x:Int,y:Int,width:Int,height:Int) { val old=v.layoutParams as FrameLayout.LayoutParams; if(old.width!=width || old.height!=height || old.leftMargin!=x || old.topMargin!=y) v.layoutParams=FrameLayout.LayoutParams(width,height).apply {leftMargin=x;topMargin=y} }
                place(logo,(w*.40).toInt(),(h*.29).toInt(),(w*.20).toInt(),(h*.33).toInt())
                place(label,0,(h*.69).toInt(),w,(h*.07).toInt()); place(footer,0,(h*.91).toInt(),w,(h*.05).toInt())
                label.setTextSize(TypedValue.COMPLEX_UNIT_PX,w*.0155f); footer.setTextSize(TypedValue.COMPLEX_UNIT_PX,w*.0095f)
            }
        }
        startupCover=cover; root.addView(cover, FrameLayout.LayoutParams(-1,-1))
        val dots=android.animation.ValueAnimator.ofInt(0,2).apply { duration=1500; interpolator=android.view.animation.LinearInterpolator(); repeatCount=android.animation.ValueAnimator.INFINITE; addUpdateListener { val text="carregando sua experiência ..."; val active=(it.animatedFraction*3).toInt().coerceIn(0,2); label.text=android.text.SpannableString(text).apply { for(i in 0..2) setSpan(android.text.style.ForegroundColorSpan(Color.argb(if(i==active) 255 else 55,255,255,255)),text.length-3+i,text.length-2+i,0) } }; start() }
        cover.addOnAttachStateChangeListener(object:View.OnAttachStateChangeListener { override fun onViewAttachedToWindow(v:View){}; override fun onViewDetachedFromWindow(v:View){dots.cancel()} })
    }
    private fun dismissStartupCover(fade:Boolean) {
        val cover=startupCover ?: return
        startupCover=null
        if(fade) cover.animate().alpha(0f).setDuration(650).withEndAction {root.removeView(cover)}.start() else root.removeView(cover)
    }
    private fun waitForWebSplash() {
        if(startupCover==null || webViewReleased || startupFailed || !pageFinished) return
        webView.evaluateJavascript("""(function(){if(document.querySelector('.ott-profiles,.ott-home,.ott-profile-load-error'))return 'ready';return 'wait'})()""") { result ->
            if(startupCover!=null && !webViewReleased) when(result) {
                "\"ready\"" -> dismissStartupCover(true)
                else -> startupHandler.postDelayed({waitForWebSplash()},350)
            }
        }
    }
    private fun wrongStation(uri:Uri):Boolean {
        val segments=uri.pathSegments
        return segments.size>=2 && segments[1]=="player" && segments[0]!=stationSlug
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        rendererRetries = savedInstanceState?.getInt("nexoRendererRetries", 0) ?: 0
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
                if (BuildConfig.DEBUG) cacheMode = WebSettings.LOAD_DEFAULT
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
                if (isPlayerOrigin(uri)) { if (wrongStation(uri)) { view.loadUrl(startUrl); return true }; return false }
                if (request.hasGesture() && uri.scheme == "https") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                val uri=Uri.parse(url)
                if(isPlayerOrigin(uri) && wrongStation(uri)) view.post { if(!webViewReleased) view.loadUrl(startUrl) }
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (!isPlayerOrigin(Uri.parse(url))) return
                view.evaluateJavascript(assets.open("tv-remote.js").bufferedReader().use { it.readText() }, null)
                pageFinished = true
                Log.i("NexoStartup", "Documento carregado: $url")
                waitForWebSplash()
                view.requestFocus()
                immersive()
            }
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.e("NexoStartup", "WebView renderer encerrado; crash=${detail.didCrash()}")
                if (webViewReleased || view !== webView) return true
                startupHandler.removeCallbacksAndMessages(null)
                webViewReleased = true
                fullScreenView?.let { root.removeView(it) }
                fullScreenView = null
                fullScreenCallback = null
                root.removeView(view)
                view.destroy()
                if (rendererRetries < 1 && !isFinishing) {
                    rendererRetries++
                    root.post { if (!isFinishing) recreate() }
                } else showConnectionError("O mecanismo de vídeo da TV encerrou inesperadamente.")
                return true
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    Log.e("NexoStartup", "Erro principal ${error.errorCode}: ${error.description}; ${request.url}")
                    showConnectionError("Falha ao carregar o endereço do player (${error.errorCode}).")
                }
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
        showStartupCover()
        if (BuildConfig.DEBUG) android.util.Log.i("NexoOrigin", "Loading $startUrl")
        webView.loadUrl(startUrl, mapOf("Cache-Control" to "no-cache"))
        startupHandler.postDelayed({
            if(startupCover!=null && !webViewReleased && !startupFailed) {
                Log.e("NexoStartup", "Tempo de inicializacao excedido; documento=$pageFinished")
                showConnectionError(if(pageFinished) "O player abriu, mas os perfis não ficaram prontos." else "O servidor do player não respondeu a tempo.")
            }
        },60000)
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
    private fun showConnectionError(message: String) {
        if (errorPanel != null) return
        startupFailed = true
        startupHandler.removeCallbacksAndMessages(null)
        dismissStartupCover(false)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(Color.BLACK)
        }
        panel.addView(TextView(this).apply { text = message; setTextColor(Color.WHITE); textSize = 18f })
        panel.addView(Button(this).apply {
            text = "Tentar novamente"
            setOnClickListener { rendererRetries = 0; recreate() }
        })
        errorPanel = panel
        root.addView(panel, FrameLayout.LayoutParams(-1, -1))
        panel.getChildAt(1).requestFocus()
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt("nexoRendererRetries", rendererRetries)
        super.onSaveInstanceState(outState)
    }
    @Deprecated("Android TV Back key")
    override fun onBackPressed() {
        if (webViewReleased || startupFailed) { finish(); return }
        if (fullScreenView != null) { hideFullScreen(); return }
        webView.evaluateJavascript("(function(){var e=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});return(document.activeElement||document.body).dispatchEvent(e)})()") { unhandled ->
            if (unhandled == "true") { if (webView.canGoBack()) webView.goBack() else finish() }
        }
    }
    private var restartAtProfiles = false
    private var webViewReleased = false
    private fun releasePlayer() {
        if (!::webView.isInitialized || webViewReleased) return
        webViewReleased = true
        startupHandler.removeCallbacksAndMessages(null)
        dismissStartupCover(false)
        hideFullScreen()
        webView.stopLoading()
        webView.onPause()
        CookieManager.getInstance().flush()
        root.removeView(webView)
        // Destruir o documento encerra audio, video, HLS, iframes e todos os timers.
        // Cookies e localStorage nao sao apagados.
        webView.destroy()
    }
    override fun onStop() {
        restartAtProfiles = true
        releasePlayer()
        super.onStop()
    }
    override fun onResume() {
        super.onResume()
        if (restartAtProfiles) { restartAtProfiles = false; recreate(); return }
        if (::webView.isInitialized && !webViewReleased) webView.onResume()
        immersive()
    }
    override fun onPause() {
        if (::webView.isInitialized && !webViewReleased) webView.onPause()
        super.onPause()
    }
    override fun onDestroy() { releasePlayer(); super.onDestroy() }
}
