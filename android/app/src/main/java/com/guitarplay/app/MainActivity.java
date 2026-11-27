package com.guitarplay.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.widget.Toast;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Rational;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://v0-playtube.vercel.app";
    private WebView webView;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private SpeechRecognizer recognizer;
    private boolean micPending = false;
    private static final int REQ_MIC = 1001;
    private boolean playing;
    private WebMessagePort playbackPort;
    private int navigation;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setLoadWithOverviewMode(true);
        webView.getSettings().setUseWideViewPort(true);
        // Always load the live site fresh: a cached copy kept showing the
        // old dashboard after site updates.
        webView.clearCache(true);
        webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.getSettings().setUserAgentString(webView.getSettings().getUserAgentString() + " PlayTubeLocalMusic/1 PlayTubeLocalVideo/1");
        // Mic: an app WebView does not reliably provide web speech recognition,
        // so the site's mic button uses this native bridge (window.PlayTubeMic),
        // which runs Android's own speech recognizer and returns the transcript
        // to the page. The web speech path is kept for normal browsers.
        webView.addJavascriptInterface(new MicBridge(), "PlayTubeMic");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && request.hasGesture() && isDashboard(view.getUrl())
                        && (ORIGIN + "/local-music").equals(request.getUrl().toString())) {
                    view.evaluateJavascript("document.querySelector('.yt-player iframe')?.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),'https://www.youtube.com')", null);
                    setPlaying(false);
                    startActivity(new Intent(MainActivity.this, LocalMusicActivity.class));
                    return true;
                }
                Uri link = request.getUrl();
                if (request.isForMainFrame() && request.hasGesture() && isDashboard(view.getUrl())
                        && "https".equals(link.getScheme()) && "www.youtube.com".equals(link.getEncodedAuthority())
                        && "/watch".equals(link.getPath())) {
                    String video = link.getQueryParameter("v");
                    if (video == null || !video.matches("[A-Za-z0-9_-]{11}")) return false;
                    Uri.Builder destination = Uri.parse("https://www.youtube.com/watch").buildUpon().appendQueryParameter("v", video);
                    String time = link.getQueryParameter("t");
                    if (time != null && time.matches("[0-9]{1,10}s")) destination.appendQueryParameter("t", time);
                    Intent open = new Intent(Intent.ACTION_VIEW, destination.build()).addCategory(Intent.CATEGORY_BROWSABLE);
                    setPlaying(false);
                    try {
                        startActivity(open.setPackage("com.google.android.youtube"));
                    } catch (ActivityNotFoundException missingYouTube) {
                        try { startActivity(open.setPackage(null)); }
                        catch (ActivityNotFoundException missingBrowser) {
                            Toast.makeText(MainActivity.this, "Install YouTube or a web browser to open this video.", Toast.LENGTH_LONG).show();
                        }
                    }
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
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                // Only grant mic/camera to our own deployed site.
                String origin = request.getOrigin() != null ? request.getOrigin().toString() : "";
                if (origin.contains("v0-playtube.vercel.app")) {
                    request.grant(request.getResources());
                } else {
                    request.deny();
                }
            }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                // Fullscreen video from the player: show the video view
                // over the whole screen (the embed's fullscreen button
                // does nothing without this).
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            }
            @Override public void onHideCustomView() {
                hideCustomView();
            }
        });
        if (android.os.Build.VERSION.SDK_INT >= 35) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        setContentView(root);
        if (state == null || webView.restoreState(state) == null) {
            webView.loadUrl(ORIGIN + "/");
        }
    }

    private class MicBridge {
        @JavascriptInterface public void startListening() {
            runOnUiThread(() -> startNativeListening());
        }

        @JavascriptInterface public void stopListening() {
            runOnUiThread(() -> stopRecognizer());
        }
    }

    private void startNativeListening() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            // Ask once; when granted, onRequestPermissionsResult restarts listening.
            micPending = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendMicError("not-supported");
            return;
        }
        stopRecognizer();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onPartialResults(Bundle partialResults) {}
            @Override public void onEvent(int eventType, Bundle params) {}
            @Override public void onResults(Bundle results) {
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String text = (list != null && !list.isEmpty()) ? list.get(0) : "";
                sendMicResult(text);
            }
            @Override public void onError(int error) {
                String code = "error";
                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    code = "no-speech";
                } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    code = "not-allowed";
                } else if (error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || error == SpeechRecognizer.ERROR_SERVER) {
                    code = "network";
                }
                sendMicError(code);
            }
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toString());
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizer.startListening(intent);
    }

    private void stopRecognizer() {
        if (recognizer != null) {
            try { recognizer.stopListening(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private void sendMicResult(final String text) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.__playtubeMicResult && window.__playtubeMicResult(" + JSONObject.quote(text) + ")", null);
            }
        });
    }

    private void sendMicError(final String code) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.__playtubeMicError && window.__playtubeMicError(" + JSONObject.quote(code) + ")", null);
            }
        });
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_MIC) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && micPending) {
                micPending = false;
                startNativeListening();
            } else {
                micPending = false;
                sendMicError("not-allowed");
            }
        }
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (customCallback != null) { customCallback.onCustomViewHidden(); customCallback = null; }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
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
        stopRecognizer();
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
        // A fullscreen video exits fullscreen first, like YouTube.
        if (customView != null) { hideCustomView(); return; }
        webView.evaluateJavascript("typeof window.__playtubeGoBack === 'function' && window.__playtubeGoBack()", handled -> {
            if ("true".equals(handled)) return;
            if (webView.canGoBack()) webView.goBack();
            else super.onBackPressed();
        });
    }
}
