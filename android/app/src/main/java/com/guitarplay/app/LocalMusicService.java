package com.guitarplay.app;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.*;
import android.view.SurfaceHolder;

public final class LocalMusicService extends Service {
    static final String PLAY = "play", PAUSE = "pause", STOP = "stop";
    private static final String CHANNEL = "local_audio";
    private static final int NOTIFICATION = 42;
    private MediaPlayer player;
    private SurfaceHolder display;
    private boolean videoTrack;
    int videoWidth, videoHeight;

    void attachDisplay(SurfaceHolder holder) {
        display = holder;
        if (player != null) player.setDisplay(holder);
    }

    void detachDisplay(SurfaceHolder holder) {
        if (holder == display) attachDisplay(null);
    }

    boolean hasVideo() { return videoTrack || (videoWidth > 0 && videoHeight > 0); }
    private MediaSession session;
    private AudioManager audio;
    private boolean prepared, resumeOnGain, foreground;
    private String title = "", status = "Choose an audio or video file.";
    private int state = PlaybackState.STATE_STOPPED;
    Runnable changed;
    final class MusicBinder extends Binder { LocalMusicService service() { return LocalMusicService.this; } }
    private final MusicBinder binder = new MusicBinder();
    private final AudioManager.OnAudioFocusChangeListener focus = change -> {
        if (change == AudioManager.AUDIOFOCUS_GAIN && resumeOnGain) {
            resumeOnGain = false;
            playPrepared();
        } else if (change < 0) {
            boolean interrupted = isPlaying();
            pause();
            resumeOnGain = change != AudioManager.AUDIOFOCUS_LOSS && interrupted;
        }
    };
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { pause(); }
    };

    @Override public void onCreate() {
        super.onCreate();
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL, "Local music & videos", NotificationManager.IMPORTANCE_LOW));
        }
        session = new MediaSession(this, "PlayTube local music");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { requestPlay(); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { finishTrack("Stopped"); }
            @Override public void onSeekTo(long pos) { if (prepared) player.seekTo((int)Math.min(Integer.MAX_VALUE, pos)); publish(); }
        });
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, filter);
    }

    @Override public IBinder onBind(Intent intent) { return binder; }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (PLAY.equals(action)) {
            Uri uri = intent.getData();
            if (uri != null && "content".equals(uri.getScheme())) open(uri, intent.getStringExtra("title"));
            else if (prepared) requestPlay();
            else finishTrack("Choose an audio or video file.");
        } else if (PAUSE.equals(action)) pause();
        else if (STOP.equals(action)) finishTrack("Stopped");
        return START_NOT_STICKY;
    }

    private void open(Uri uri, String name) {
        releasePlayer();
        title = name == null ? "Local media" : name;
        state = PlaybackState.STATE_BUFFERING;
        status = "Loading…";
        session.setActive(true);
        session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).build());
        publish();
        promote();
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            if (display != null && display.getSurface().isValid()) player.setDisplay(display);
            player.setOnVideoSizeChangedListener((mp, width, height) -> {
                if (mp != player) return;
                videoWidth = width;
                videoHeight = height;
                if (changed != null) changed.run();
            });
            player.setOnPreparedListener(mp -> {
                if (player != mp) return;
                prepared = true;
                for (MediaPlayer.TrackInfo info : mp.getTrackInfo()) {
                    if (info.getTrackType() == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_VIDEO) videoTrack = true;
                }
                session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title)
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, mp.getDuration()).build());
                requestPlay();
            });
            player.setOnCompletionListener(mp -> { if (mp == player) finishTrack("Finished"); });
            player.setOnErrorListener((mp, what, extra) -> {
                if (mp == player) finishTrack("This file could not be played. Choose another media file.");
                return true;
            });
            player.setDataSource(this, uri);
            player.prepareAsync();
        } catch (Exception ex) { finishTrack("This file could not be opened. Choose the file again."); }
    }

    private void promote() {
        startForeground(NOTIFICATION, notification());
        foreground = true;
    }

    private void requestPlay() {
        if (!prepared || isPlaying()) return;
        // Android 15 requires foreground status before requesting audio focus.
        promote();
        if (audio.requestAudioFocus(focus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
                != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            pause();
            status = "Audio is in use. Tap Play to try again.";
            publish();
            return;
        }
        playPrepared();
    }

    private void playPrepared() {
        if (!prepared) return;
        player.start();
        state = PlaybackState.STATE_PLAYING;
        status = "Playing";
        publish();
    }
    private void pause() {
        resumeOnGain = false;
        if (!prepared) return;
        if (player.isPlaying()) player.pause();
        state = PlaybackState.STATE_PAUSED;
        status = "Paused";
        publish();
    }
    private void releasePlayer() {
        prepared = false;
        videoTrack = false;
        videoWidth = videoHeight = 0;
        resumeOnGain = false;
        if (player != null) { player.release(); player = null; }
        audio.abandonAudioFocus(focus);
    }
    private void finishTrack(String message) {
        releasePlayer();
        status = message;
        state = PlaybackState.STATE_STOPPED;
        foreground = false;
        publish();
        session.setActive(false);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    boolean isPlaying() { return state == PlaybackState.STATE_PLAYING; }
    boolean hasPlayer() { return player != null; }
    boolean isReady() { return prepared; }
    String title() { return title; }
    String status() { return status; }

    private PendingIntent command(String action) {
        return PendingIntent.getService(this, 0, new Intent(this, LocalMusicService.class).setAction(action),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, LocalMusicActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(title).setContentText(status)
            .setContentIntent(open).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1))
            .addAction(isPlaying() ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying() ? "Pause" : "Play", command(isPlaying() ? PAUSE : PLAY))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", command(STOP))
            .build();
    }
    private void publish() {
        long actions = PlaybackState.ACTION_STOP | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE;
        if (prepared) actions |= PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions)
            .setState(state, prepared ? player.getCurrentPosition() : 0, isPlaying() ? 1f : 0f).build());
        if (foreground) getSystemService(NotificationManager.class).notify(NOTIFICATION, notification());
        if (changed != null) changed.run();
    }
    @Override public void onDestroy() {
        releasePlayer();
        unregisterReceiver(noisy);
        session.release();
        super.onDestroy();
    }
}
