import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { termApi } from "@/lib/api";
import { toast } from "sonner";
import { PhoneCall, MapPin, X } from "lucide-react";

export function ServicioModal({ open, onOpenChange, operadoresLibres, onCreated, form, setForm, coords, onPick, onClearPick }) {
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.origen.trim() || !form.destino.trim()) {
      toast.error("Origen y destino son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        cliente_nombre: form.cliente_nombre || null,
        cliente_telefono: form.cliente_telefono || null,
        origen: {
          texto: form.origen,
          ...(coords?.origen?.lat != null ? { lat: coords.origen.lat, lng: coords.origen.lng } : {}),
        },
        destino: {
          texto: form.destino,
          ...(coords?.destino?.lat != null ? { lat: coords.destino.lat, lng: coords.destino.lng } : {}),
        },
        operador_asignado_id: form.operador_id || null,
      };
      const { data } = await termApi.post("/servicios", payload);
      toast.success(data.asignado ? "Servicio creado y asignado" : "Servicio creado (pendiente)");
      onCreated?.(data.servicio || data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo crear el servicio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="servicio-modal"
        className="bg-[#17191E] border border-white/[0.06] text-[#F5F5F7] sm:max-w-[460px] rounded-[18px] shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#F5F5F7]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4F5DFF]/15 text-[#4F5DFF]">
              <PhoneCall className="h-5 w-5" />
            </span>
            Nueva llamada de servicio
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Registra la llamada y asígnala a un taxi libre.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-foreground/90">Cliente</Label>
              <Input
                data-testid="servicio-cliente-nombre"
                value={form.cliente_nombre}
                onChange={(e) => set("cliente_nombre", e.target.value)}
                placeholder="Nombre (opcional)"
                className="input-inset border-border text-foreground"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-foreground/90">Teléfono</Label>
              <Input
                data-testid="servicio-cliente-telefono"
                value={form.cliente_telefono}
                onChange={(e) => set("cliente_telefono", e.target.value)}
                placeholder="Teléfono (opcional)"
                className="input-inset border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[#F5F5F7]/90">Origen *</Label>
              <button type="button" data-testid="pick-origen" onClick={() => onPick?.("origen")} className="flex items-center gap-1 text-xs text-[#4F5DFF] hover:text-[#3D49D6]">
                <MapPin className="h-3 w-3" /> Marcar en mapa
              </button>
            </div>
            <Input
              data-testid="servicio-origen"
              value={form.origen}
              onChange={(e) => set("origen", e.target.value)}
              placeholder="Ej. Parque Central"
              className="input-inset border-border text-[#F5F5F7]"
            />
            {coords?.origen && (
              <div className="flex items-center gap-2 text-xs text-[#7CFC3C]">
                <MapPin className="h-3 w-3" /> {coords.origen.lat.toFixed(4)}, {coords.origen.lng.toFixed(4)}
                <button type="button" onClick={() => onClearPick?.("origen")} className="text-muted-foreground hover:text-[#F5F5F7]/80"><X className="h-3 w-3" /></button>
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[#F5F5F7]/90">Destino *</Label>
              <button type="button" data-testid="pick-destino" onClick={() => onPick?.("destino")} className="flex items-center gap-1 text-xs text-[#4F5DFF] hover:text-[#3D49D6]">
                <MapPin className="h-3 w-3" /> Marcar en mapa
              </button>
            </div>
            <Input
              data-testid="servicio-destino"
              value={form.destino}
              onChange={(e) => set("destino", e.target.value)}
              placeholder="Ej. Pakal Ná"
              className="input-inset border-border text-[#F5F5F7]"
            />
            {coords?.destino && (
              <div className="flex items-center gap-2 text-xs text-[#7CFC3C]">
                <MapPin className="h-3 w-3" /> {coords.destino.lat.toFixed(4)}, {coords.destino.lng.toFixed(4)}
                <button type="button" onClick={() => onClearPick?.("destino")} className="text-muted-foreground hover:text-[#F5F5F7]/80"><X className="h-3 w-3" /></button>
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-foreground/90">Asignar a taxi libre</Label>
            <Select value={form.operador_id} onValueChange={(v) => set("operador_id", v)}>
              <SelectTrigger
                data-testid="servicio-operador-select"
                className="input-inset border-border text-foreground"
              >
                <SelectValue placeholder="Sin asignar (pendiente)" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                {operadoresLibres.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">No hay taxis libres</div>
                )}
                {operadoresLibres.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="focus:bg-secondary">
                    {o.nombre} · {o.placa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            data-testid="servicio-submit"
            onClick={submit}
            loading={saving}
            className="h-11"
          >
            {saving ? "Guardando..." : "Crear servicio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
