package com.taxihub.operador;

import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private TaxiHubNativeBridge nativeBridge;

    // Un solo puente (un solo motor de voz) para el plugin y para window.TaxiHubNative.
    public synchronized TaxiHubNativeBridge getNativeBridge() {
        if (nativeBridge == null) nativeBridge = new TaxiHubNativeBridge(this);
        return nativeBridge;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Antes de super.onCreate: así el plugin existe desde la primera carga de la web.
        registerPlugin(TaxiHubNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Encender pantalla y mostrar sobre la pantalla de bloqueo para avisos de despacho de servicios
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }

        // Solicitar permisos de notificación y ubicación nativos al arrancar
        requestRuntimePermissions();

        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setGeolocationEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);

            // window.TaxiHubNative (compatibilidad): solo aparece tras una recarga; la web
            // usa primero Capacitor.Plugins.TaxiHubNative, que está desde el inicio.
            bridge.getWebView().addJavascriptInterface(getNativeBridge(), "TaxiHubNative");
        }
    }

    public void requestRuntimePermissions() {
        runOnUiThread(() -> {
            List<String> perms = new ArrayList<>();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    perms.add(android.Manifest.permission.POST_NOTIFICATIONS);
                }
            }
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                perms.add(android.Manifest.permission.ACCESS_FINE_LOCATION);
            }
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                perms.add(android.Manifest.permission.ACCESS_COARSE_LOCATION);
            }
            if (!perms.isEmpty()) {
                ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), 1001);
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
