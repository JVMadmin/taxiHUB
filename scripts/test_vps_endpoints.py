import subprocess
import json

KEY_PATH = r"C:\Users\Quantum\Downloads\ssh-key-2026-10-06.key"
VPS_HOST = "ubuntu@159.54.146.150"

def run_remote_sh(script_content):
    cmd = [
        "ssh",
        "-i", KEY_PATH,
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        VPS_HOST,
        "bash -s"
    ]
    proc = subprocess.run(cmd, input=script_content.encode("utf-8"), capture_output=True)
    return proc.returncode, proc.stdout.decode("utf-8", errors="replace"), proc.stderr.decode("utf-8", errors="replace")

test_script = """
# no set -e to see everything

echo '--- 1. Testing Config Sitio (inside backend container) ---'
sudo docker exec taxihub-backend curl -s http://127.0.0.1:8000/api/config/sitio | grep -o '"nombre":[^,]*'

echo '--- 2. Terminal Login (central / central123) ---'
RESP=$(sudo docker exec taxihub-backend curl -s -X POST http://127.0.0.1:8000/api/terminal/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"central","contrasena":"central123"}')
echo "$RESP" | grep -o '"token":"[^"]*'

TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo '--- 3. Terminal Protected Endpoint: Operadores, Rutas, Clientes, Vehiculos ---'
echo "Operadores: $(sudo docker exec taxihub-backend curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/operadores | grep -o '"placa":' | wc -l)"
echo "Rutas: $(sudo docker exec taxihub-backend curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/rutas | grep -o '"nombre":' | wc -l)"
echo "Clientes: $(sudo docker exec taxihub-backend curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/clientes | grep -o '"nombre":' | wc -l)"
echo "Vehiculos: $(sudo docker exec taxihub-backend curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/vehiculos | grep -o '"placa":' | wc -l)"
echo "Servicios: $(sudo docker exec taxihub-backend curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/servicios | grep -o '"origen":' | wc -l)"

echo '--- 4. Socio / Dueno Login (socio_roberto / socio123) ---'
DUENO_RESP=$(sudo docker exec taxihub-backend curl -s -X POST http://127.0.0.1:8000/api/dueno/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"socio_roberto","contrasena":"socio123"}')
echo "$DUENO_RESP" | grep -o '"nombre":[^,]*'
DUENO_TOKEN=$(echo "$DUENO_RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
sudo docker exec taxihub-backend curl -s -H "Authorization: Bearer $DUENO_TOKEN" http://127.0.0.1:8000/api/dueno/dashboard | head -c 200
echo ""

echo '--- 5. Operador Login (op1 / taxi123) ---'
OP_RESP=$(sudo docker exec taxihub-backend curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"op1","contrasena":"taxi123"}')
echo "$OP_RESP" | grep -o '"token":"[^"]*'
OP_TOKEN=$(echo "$OP_RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Operador /auth/me profile:"
sudo docker exec taxihub-backend curl -s -H "Authorization: Bearer $OP_TOKEN" http://127.0.0.1:8000/api/auth/me | grep -o '"usuario":"op1"'

echo '--- 6. Nginx Frontend Proxying API to Backend ---'
sudo docker exec nexium-caddy wget -qO- http://taxihub-frontend:80/api/config/sitio | grep -o '"nombre":[^,]*'

echo '--- 7. Caddy routing Host: taxihub.cloud ---'
curl -s -I -H "Host: taxihub.cloud" http://127.0.0.1:80/ | head -n 5

echo '=== ALL TESTS PASSED SUCCESSFULLY! ==='
"""

test_script = test_script.replace('\r\n', '\n')
code, out, err = run_remote_sh(test_script)
print("Return code:", code)
print("STDOUT:\n", out)
if err:
    print("STDERR:\n", err)
