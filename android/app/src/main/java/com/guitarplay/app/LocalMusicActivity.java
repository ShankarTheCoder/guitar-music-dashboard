package com.guitarplay.app;

import android.app.Activity;
import android.content.*;
import android.database.Cursor;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.SurfaceView;
import android.view.SurfaceHolder;
import android.view.Gravity;
import android.widget.*;

public final class LocalMusicActivity extends Activity {
    private static final int PICK_MEDIA = 21;
    private LocalMusicService service;
    private TextView track, status;
    private Button toggle, stop;
    private SurfaceView video;
    private double aspectRatio = 16.0 / 9.0;
    private Uri selected;
    private String selectedTitle = "";
    private boolean bound;
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((LocalMusicService.MusicBinder) binder).service();
            service.changed = LocalMusicActivity.this::render;
            if (video.getHolder().getSurface().isValid()) service.attachDisplay(video.getHolder());
            render();
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; render(); }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        SharedPreferences prefs = getSharedPreferences("local_music", MODE_PRIVATE);
        String uri = prefs.getString("uri", null);
        if (uri != null) selected = Uri.parse(uri);
        selectedTitle = prefs.getString("title", "");
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(0xff101010);
        int pad = (int)(20 * getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        if (Build.VERSION.SDK_INT >= 35) layout.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            view.setPadding(pad + bars.left, pad + bars.top, pad + bars.right, pad + bars.bottom);
            return insets;
        });
        addButton(layout, "Back", v -> finish());
        TextView heading = label(layout, 28);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.setText("Local music & videos");
        video = new SurfaceView(this) {
            @Override protected void onMeasure(int widthSpec, int heightSpec) {
                int availableWidth = MeasureSpec.getSize(widthSpec);
                int maxHeight = getResources().getDisplayMetrics().heightPixels / 2;
                int height = Math.max(1, Math.min(maxHeight, (int)(availableWidth / aspectRatio)));
                setMeasuredDimension(Math.min(availableWidth, (int)Math.round(height * aspectRatio)), height);
            }
        };
        LinearLayout.LayoutParams videoLayout = new LinearLayout.LayoutParams(-1, -2);
        videoLayout.gravity = Gravity.CENTER_HORIZONTAL;
        layout.addView(video, videoLayout);
        video.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder holder) {
                if (service != null) service.attachDisplay(holder);
            }
            @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) { }
            @Override public void surfaceDestroyed(SurfaceHolder holder) {
                if (service != null) service.detachDisplay(holder);
            }
        });
        track = label(layout, 19);
        status = label(layout, 15);
        addButton(layout, "Choose audio or video file", v -> {
            Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "video/*"});
            try { startActivityForResult(pick, PICK_MEDIA); }
            catch (ActivityNotFoundException ex) { status.setText("No file picker is available on this device."); }
        });
        toggle = addButton(layout, "Play", v -> {
            if (service != null && service.hasPlayer()) send(service.isPlaying() ? LocalMusicService.PAUSE : LocalMusicService.PLAY, false);
            else if (selected != null) send(LocalMusicService.PLAY, true);
        });
        stop = addButton(layout, "Stop", v -> send(LocalMusicService.STOP, false));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(layout);
        setContentView(scroll);
        render();
    }

    private TextView label(LinearLayout parent, int size) {
        TextView view = new TextView(this);
        view.setTextSize(size);
        view.setPadding(0, 12, 0, 12);
        parent.addView(view);
        return view;
    }
    private Button addButton(LinearLayout parent, String text, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setOnClickListener(listener);
        parent.addView(button);
        return button;
    }
    private void render() {
        boolean active = service != null && service.hasPlayer();
        boolean showVideo = active && service.hasVideo();
        if (showVideo && service.videoWidth > 0 && service.videoHeight > 0) {
            double ratio = (double) service.videoWidth / service.videoHeight;
            if (aspectRatio != ratio) { aspectRatio = ratio; video.requestLayout(); }
        }
        video.setVisibility(showVideo ? View.VISIBLE : View.GONE);
        video.setKeepScreenOn(showVideo && service.isPlaying());
        track.setText(active ? service.title() : selectedTitle);
        status.setText(service == null || (!active && selected != null && service.status().equals("Choose an audio or video file."))
            ? (selected == null ? "Choose an audio or video file from your phone." : "Ready") : service.status());
        toggle.setText(active && service.isPlaying() ? "Pause" : "Play");
        toggle.setEnabled(service != null && (active ? service.isReady() : selected != null));
        stop.setEnabled(active);
    }

    @Override protected void onStart() {
        super.onStart();
        bound = bindService(new Intent(this, LocalMusicService.class), connection, BIND_AUTO_CREATE);
    }
    @Override protected void onStop() {
        if (service != null) {
            service.changed = null;
            service.detachDisplay(video.getHolder());
        }
        if (bound) unbindService(connection);
        service = null;
        bound = false;
        super.onStop();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_MEDIA || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (!"content".equals(uri.getScheme())) return;
        String title = "Local media";
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) title = cursor.getString(0);
        } catch (RuntimeException ignored) { }
        Uri old = selected;
        selected = uri;
        selectedTitle = title;
        SharedPreferences.Editor edit = getSharedPreferences("local_music", MODE_PRIVATE).edit();
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            edit.putString("uri", uri.toString()).putString("title", title).apply();
        } catch (SecurityException temporaryGrant) { edit.clear().apply(); }
        send(LocalMusicService.PLAY, true);
        if (old != null && !old.equals(uri)) {
            try { getContentResolver().releasePersistableUriPermission(old, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (SecurityException ignored) { }
        }
    }
    private void send(String action, boolean openFile) {
        Intent intent = new Intent(this, LocalMusicService.class).setAction(action);
        if (openFile) intent.setData(selected).putExtra("title", selectedTitle);
        if (LocalMusicService.PLAY.equals(action) && Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
        else startService(intent);
    }
}
