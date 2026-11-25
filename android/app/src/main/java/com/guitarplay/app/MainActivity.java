package com.guitarplay.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.webkit.WebResourceRequest;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.util.Rational;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://v0-playtube.vercel.app";
    private WebView webView;
    private boolean playing;
    private WebMessagePort playbackPort;
    private int navigation;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setUserAgentString(webView.getSettings().getUserAgentString() + " PlayTubeLocalMusic/1");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && request.hasGesture() && isDashboard(view.getUrl())
                        && (ORIGIN + "/local-music").equals(request.getUrl().toString())) {
                    view.evaluateJavascript("document.querySelector('.yt-player iframe')?.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),'https://www.youtube.com')", null);
                    setPlaying(false);
                    startActivity(new Intent(MainActivity.this, LocalMusicActivity.class));
                    return true;
                }
                return false;
            }

            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                navigation++;
                disconnectPlayback();
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (supportsPip() && isDashboard(url) && isDashboard(view.getUrl())) observePlayback();
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        if (android.os.Build.VERSION.SDK_INT >= 35) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        setContentView(webView);
        if (state == null || webView.restoreState(state) == null) {
            webView.loadUrl(ORIGIN + "/");
        }
    }

    private boolean supportsPip() {
        return Build.VERSION.SDK_INT >= 26 && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private boolean isDashboard(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equals(uri.getScheme()) && "v0-playtube.vercel.app".equals(uri.getEncodedAuthority());
    }

    private void disconnectPlayback() {
        if (playbackPort != null) {
            playbackPort.close();
            playbackPort = null;
        }
        setPlaying(false);
    }

    private void observePlayback() {
        final int page = navigation;
        // Transfer a port to the top-level dashboard only. The YouTube iframe has no native bridge.
        String setup = "(() => { function connect(e) { if (e.data !== 'playtube-native-port' || !e.ports.length) return;"
            + "window.removeEventListener('message',connect); const port=e.ports[0];"
            + "const send=()=>port.postMessage(document.querySelector('.yt-app')?.dataset.playing==='true'?'playing':'idle');"
            + "new MutationObserver(send).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-playing']});send();}"
            + "window.addEventListener('message',connect); })()";
        webView.evaluateJavascript(setup, unused -> {
            if (page != navigation || !isDashboard(webView.getUrl()) || isDestroyed()) return;
            disconnectPlayback();
            WebMessagePort[] ports = webView.createWebMessageChannel();
            playbackPort = ports[0];
            playbackPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                @Override public void onMessage(WebMessagePort port, WebMessage message) {
                    if (port == playbackPort && page == navigation) setPlaying("playing".equals(message.getData()));
                }
            });
            webView.postWebMessage(new WebMessage("playtube-native-port", new WebMessagePort[]{ ports[1] }), Uri.parse(ORIGIN));
        });
    }

    private void setPlaying(boolean active) {
        if (playing == active) return;
        playing = active;
        if (supportsPip() && Build.VERSION.SDK_INT >= 31) {
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9)).setAutoEnterEnabled(active).build();
            setPictureInPictureParams(params);
        }
    }

    @Override protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (playing && supportsPip() && Build.VERSION.SDK_INT < 31 && !isFinishing() && !isInPictureInPictureMode()) {
            enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build());
        }
    }

    @Override public void onPictureInPictureModeChanged(boolean inPip, Configuration config) {
        super.onPictureInPictureModeChanged(inPip, config);
        webView.evaluateJavascript("document.documentElement.classList.toggle('android-pip'," + inPip + ")", null);
    }

    @Override protected void onDestroy() {
        navigation++;
        disconnectPlayback();
        webView.destroy();
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        webView.saveState(state);
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("typeof window.__playtubeGoBack === 'function' && window.__playtubeGoBack()", handled -> {
            if ("true".equals(handled)) return;
            if (webView.canGoBack()) webView.goBack();
            else super.onBackPressed();
        });
    }
}
