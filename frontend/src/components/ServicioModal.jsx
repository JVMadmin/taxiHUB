import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";

const EMPTY = { cliente_nombre: "", cliente_telefono: "", origen: "", destino: "", operador_id: "" };

export function ServicioModal({ open, onOpenChange, operadoresLibres, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(EMPTY); }, [open]);

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
        origen: { texto: form.origen },
        destino: { texto: form.destino },
        operador_asignado_id: form.operador_id || null,
      };
      const { data } = await api.post("/servicios", payload);
      toast.success(form.operador_id ? "Servicio creado y asignado" : "Servicio creado (pendiente)");
      onCreated?.(data);
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
        className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-[460px]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-50">
            <PhoneCall className="h-5 w-5 text-emerald-400" /> Nueva llamada de servicio
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Registra la llamada y asígnala a un taxi libre.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-zinc-300">Cliente</Label>
              <Input
                data-testid="servicio-cliente-nombre"
                value={form.cliente_nombre}
                onChange={(e) => set("cliente_nombre", e.target.value)}
                placeholder="Nombre (opcional)"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-zinc-300">Teléfono</Label>
              <Input
                data-testid="servicio-cliente-telefono"
                value={form.cliente_telefono}
                onChange={(e) => set("cliente_telefono", e.target.value)}
                placeholder="Teléfono (opcional)"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-zinc-300">Origen *</Label>
            <Input
              data-testid="servicio-origen"
              value={form.origen}
              onChange={(e) => set("origen", e.target.value)}
              placeholder="Ej. Parque Central"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-zinc-300">Destino *</Label>
            <Input
              data-testid="servicio-destino"
              value={form.destino}
              onChange={(e) => set("destino", e.target.value)}
              placeholder="Ej. Pakal Ná"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-zinc-300">Asignar a taxi libre</Label>
            <Select value={form.operador_id} onValueChange={(v) => set("operador_id", v)}>
              <SelectTrigger
                data-testid="servicio-operador-select"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              >
                <SelectValue placeholder="Sin asignar (pendiente)" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                {operadoresLibres.length === 0 && (
                  <div className="px-2 py-3 text-sm text-zinc-500">No hay taxis libres</div>
                )}
                {operadoresLibres.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="focus:bg-zinc-800">
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
            className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Cancelar
          </Button>
          <Button
            data-testid="servicio-submit"
            onClick={submit}
            disabled={saving}
            className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold"
          >
            {saving ? "Guardando..." : "Crear servicio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
