package com.taxihub.operador;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import android.webkit.JavascriptInterface;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Locale;

public class TaxiHubNativeBridge {
    private static final String TAG = "TaxiHubNative";
    private static final String CHANNEL_ID = "taxihub_dispatch";
    private final MainActivity activity;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String ttsError = null;
    private String pendiente = null; // texto pedido antes de que el motor de voz estuviera listo
    private PowerManager.WakeLock wakeLock;

    public TaxiHubNativeBridge(MainActivity activity) {
        this.activity = activity;
        createNotificationChannel();
        initTTS();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Despacho y Servicios TaxiHUB",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Alertas de audio, voz y nuevos servicios asignados");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 100, 250, 100, 300});
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            channel.setSound(defaultSoundUri, audioAttributes);

            NotificationManager nm = activity.getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void initTTS() {
        try {
            tts = new TextToSpeech(activity.getApplicationContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    int result = tts.setLanguage(new Locale("es", "MX"));
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(new Locale("es", "ES"));
                    }
                    tts.setPitch(1.0f);
                    tts.setSpeechRate(1.04f);
                    // Canal de guía de navegación: suena aunque el volumen multimedia esté bajo
                    // y baja la música del chofer mientras habla.
                    tts.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
                    ttsReady = true;
                    ttsError = null;
                    Log.i(TAG, "Motor nativo de TextToSpeech inicializado correctamente en español.");
                    String texto = pendiente;
                    pendiente = null;
                    if (texto != null) hablarAhora(texto);
                } else {
                    // Sin <queries> TTS_SERVICE en el manifiesto (Android 11+) el motor no se ve y cae aquí.
                    ttsError = "init_status_" + status;
                    Log.e(TAG, "Error al inicializar TextToSpeech nativo: status=" + status);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Excepción en initTTS: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public void wakeScreen() {
        activity.runOnUiThread(() -> {
            try {
                PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        wakeLock.release();
                    }
                    wakeLock = pm.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK |
                        PowerManager.ACQUIRE_CAUSES_WAKEUP |
                        PowerManager.ON_AFTER_RELEASE,
                        "taxihub:dispatch_wake_screen"
                    );
                    wakeLock.acquire(15000); // 15 segundos activo
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    activity.setShowWhenLocked(true);
                    activity.setTurnScreenOn(true);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error despertando pantalla: " + e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void playAlert() {
        try {
            wakeScreen();

            // 1. Vibración háptica enérgica para cabina vehicular
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(new long[]{0, 250, 100, 250, 100, 300}, -1));
                } else {
                    v.vibrate(new long[]{0, 250, 100, 250, 100, 300}, -1);
                }
            }

            // 2. Timbre audible del sistema
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            Ringtone r = RingtoneManager.getRingtone(activity.getApplicationContext(), uri);
            if (r != null) {
                r.play();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error en playAlert: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public void speak(String text) {
        if (text == null || text.trim().isEmpty()) return;
        // La alerta ("ding" + vibración) la decide la web (alertaPrevia) y llega antes;
        // sonarla aquí también la duplicaba y se encimaba con la voz.
        wakeScreen();

        activity.runOnUiThread(() -> {
            if (tts != null && ttsReady) {
                hablarAhora(text);
            } else {
                // El motor tarda ~1 s en arrancar: se habla en cuanto esté listo.
                Log.w(TAG, "TTS aún no está listo; el texto queda en espera.");
                pendiente = text;
                if (tts == null) initTTS();
            }
        });
    }

    private void hablarAhora(String text) {
        try {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "taxihub_tts_" + System.currentTimeMillis());
            Log.i(TAG, "TTS nativo hablando: " + text);
        } catch (Exception e) {
            Log.e(TAG, "Error en speak: " + e.getMessage());
        }
    }

    public boolean isTtsReady() {
        return ttsReady;
    }

    public String getTtsError() {
        return ttsError;
    }

    public boolean notificacionesPermitidas() {
        return NotificationManagerCompat.from(activity).areNotificationsEnabled();
    }

    @JavascriptInterface
    public void showNotification(String titulo, String cuerpo) {
        try {
            wakeScreen();
            Intent intent = new Intent(activity, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pendingIntent = PendingIntent.getActivity(activity, 0, intent, flags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(activity, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(titulo != null ? titulo : "TaxiHUB Chofer")
                .setContentText(cuerpo != null ? cuerpo : "Nuevo aviso de servicio")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);

            NotificationManagerCompat nmc = NotificationManagerCompat.from(activity);
            nmc.notify(101, builder.build());
        } catch (Exception e) {
            Log.e(TAG, "Error mostrando notificación nativa: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public void stop() {
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception ignored) {}
        }
    }

    @JavascriptInterface
    public void requestAllPermissions() {
        activity.requestRuntimePermissions();
    }

    @JavascriptInterface
    public boolean isNativeReady() {
        return true;
    }
}
