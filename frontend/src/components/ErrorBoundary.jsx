import { Component } from "react";
import { AlertOctagon, RotateCw } from "lucide-react";
import { Button } from "@/components/Button";

// Sin esto, cualquier error de render deja una pantalla en blanco sin
// ninguna pista (ni en consola se ve claro cuál componente fue). Captura el
// error + stack de React y lo muestra en pantalla para poder reportarlo.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary capturó:", error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground" data-testid="error-boundary">
        <div className="w-full max-w-xl rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
              <AlertOctagon className="h-5 w-5 text-destructive" />
            </span>
            <div>
              <div className="font-extrabold text-foreground">Algo se rompió al mostrar esta pantalla</div>
              <div className="text-xs text-muted-foreground">Copia el mensaje de abajo para reportarlo.</div>
            </div>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-card p-3 text-[11px] text-destructive" data-testid="error-boundary-message">
            {String(error?.message || error)}
            {info?.componentStack ? `\n${info.componentStack}` : ""}
          </pre>
          <Button size="sm" className="mt-4" onClick={() => window.location.reload()}>
            <RotateCw className="h-3.5 w-3.5" /> Recargar
          </Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;