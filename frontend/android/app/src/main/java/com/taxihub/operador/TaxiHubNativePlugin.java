package com.taxihub.operador;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Voz, alertas y notificaciones nativas para la web (`Capacitor.Plugins.TaxiHubNative`).
 *
 * Capacitor registra los plugins antes de cargar la página, así que este objeto existe
 * desde el primer render. `addJavascriptInterface` (window.TaxiHubNative) solo aparece
 * en la siguiente carga de página y por eso la voz fallaba en la APK al abrirla.
 * Reutiliza el mismo TaxiHubNativeBridge (un solo motor de voz) que MainActivity.
 */
@CapacitorPlugin(name = "TaxiHubNative")
public class TaxiHubNativePlugin extends Plugin {

    private TaxiHubNativeBridge puente() {
        return ((MainActivity) getActivity()).getNativeBridge();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        puente().speak(call.getString("texto", ""));
        call.resolve();
    }

    @PluginMethod
    public void playAlert(PluginCall call) {
        puente().playAlert();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        puente().stop();
        call.resolve();
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        puente().showNotification(call.getString("titulo", "TaxiHUB Chofer"), call.getString("cuerpo", ""));
        call.resolve();
    }

    @PluginMethod
    public void wakeScreen(PluginCall call) {
        puente().wakeScreen();
        call.resolve();
    }

    @PluginMethod
    public void requestAllPermissions(PluginCall call) {
        puente().requestAllPermissions();
        call.resolve();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("vozLista", puente().isTtsReady());
        r.put("vozError", puente().getTtsError());
        r.put("notificacionesPermitidas", puente().notificacionesPermitidas());
        call.resolve(r);
    }
}
