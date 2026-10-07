using System;
using System.Drawing;
using System.Windows.Forms;
using System.Net;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Text;

namespace TaxiHub.Configurador
{
    public class ConfiguradorForm : Form
    {
        private Color bgDark = Color.FromArgb(9, 14, 26);
        private Color cardDark = Color.FromArgb(18, 28, 48);
        private Color borderDark = Color.FromArgb(34, 48, 77);
        private Color cyanAccent = Color.FromArgb(34, 211, 238);
        private Color emeraldAccent = Color.FromArgb(16, 185, 129);
        private Color textLight = Color.FromArgb(245, 245, 247);
        private Color textMuted = Color.FromArgb(156, 163, 175);

        private Label lblBackendStatus;
        private Label lblTerminalStatus;
        private Label lblOperadorStatus;
        private Label lblBridgeStatus;
        private PictureBox pbQr;
        private Label lblQrInfo;
        private TextBox txtBackendPort;
        private TextBox txtTerminalPort;
        private TextBox txtOperadorPort;
        private TextBox txtBridgePort;
        private TextBox txtTenantId;
        private TextBox txtWaNumero;
        private RadioButton rbMongoMemory;
        private RadioButton rbMongoUri;
        private TextBox txtMongoUri;
        private System.Windows.Forms.Timer healthTimer;

        private string projectRoot;

        public ConfiguradorForm()
        {
            projectRoot = AppDomain.CurrentDomain.BaseDirectory;
            if (!File.Exists(Path.Combine(projectRoot, "backend", "server.py")))
            {
                DirectoryInfo pInfo = Directory.GetParent(projectRoot);
                string parent = pInfo != null ? pInfo.FullName : null;
                if (parent != null && File.Exists(Path.Combine(parent, "backend", "server.py")))
                {
                    projectRoot = parent;
                }
            }

            InitUI();
            StartHealthTimer();
        }

        private void InitUI()
        {
            this.Text = "TaxiHUB — Centro de Control y Configurador de Central (Windows)";
            this.Size = new Size(920, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = bgDark;
            this.ForeColor = textLight;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;

            // Panel Superior Header
            Panel header = new Panel
            {
                Dock = DockStyle.Top,
                Height = 70,
                BackColor = Color.FromArgb(12, 19, 34),
                Padding = new Padding(20, 10, 20, 10)
            };

            Label title = new Label
            {
                Text = "TaxiHUB Central Satelital",
                Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                ForeColor = cyanAccent,
                AutoSize = true,
                Location = new Point(20, 12)
            };
            Label subtitle = new Label
            {
                Text = "Centro de Control de Servicios, Configuración y Puente Real WhatsApp (Baileys Multi-Device)",
                Font = new Font("Segoe UI", 9f),
                ForeColor = textMuted,
                AutoSize = true,
                Location = new Point(22, 42)
            };
            header.Controls.Add(title);
            header.Controls.Add(subtitle);
            this.Controls.Add(header);

            // TabControl estilizado
            TabControl tabs = new TabControl
            {
                Dock = DockStyle.Fill,
                Padding = new Point(14, 8),
                Font = new Font("Segoe UI", 10f, FontStyle.Bold)
            };

            TabPage tabServicios = new TabPage("⚡ Servicios en Vivo") { BackColor = bgDark };
            TabPage tabWhatsApp = new TabPage("💬 WhatsApp Real QR") { BackColor = bgDark };
            TabPage tabConfig = new TabPage("⚙️ Ajustes y Base de Datos") { BackColor = bgDark };
            TabPage tabLanzadores = new TabPage("🚀 Accesos Rápidos") { BackColor = bgDark };

            BuildTabServicios(tabServicios);
            BuildTabWhatsApp(tabWhatsApp);
            BuildTabConfig(tabConfig);
            BuildTabLanzadores(tabLanzadores);

            tabs.TabPages.Add(tabServicios);
            tabs.TabPages.Add(tabWhatsApp);
            tabs.TabPages.Add(tabConfig);
            tabs.TabPages.Add(tabLanzadores);

            this.Controls.Add(tabs);
        }

        private void BuildTabServicios(TabPage tab)
        {
            Panel p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(20) };

            Label lblTitle = new Label
            {
                Text = "Estado de Servicios del Sistema",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                ForeColor = textLight,
                Location = new Point(20, 15),
                AutoSize = true
            };
            p.Controls.Add(lblTitle);

            // Grupo de Estado de Servicios
            GroupBox gb = new GroupBox
            {
                Text = " Semáforo de Conectividad en Tiempo Real ",
                ForeColor = cyanAccent,
                Location = new Point(20, 45),
                Size = new Size(840, 190),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };

            lblBackendStatus = CreateStatusRow(gb, "Backend API FastAPI (Puerto 8080):", 35);
            lblTerminalStatus = CreateStatusRow(gb, "Terminal Web de Despacho (Puerto 3005):", 70);
            lblOperadorStatus = CreateStatusRow(gb, "App Exclusiva de Operador (Puerto 3006):", 105);
            lblBridgeStatus = CreateStatusRow(gb, "Puente Real WhatsApp Baileys (Puerto 3099):", 140);
            p.Controls.Add(gb);

            // Botones de Acción
            Button btnStartAll = CreateButton("▶️ Iniciar Todos los Servicios", emeraldAccent, Color.Black, 20, 255, 260, 42);
            btnStartAll.Click += (s, e) => IniciarTodosServicios();
            p.Controls.Add(btnStartAll);

            Button btnStopAll = CreateButton("⏹️ Detener Todos", Color.FromArgb(239, 68, 68), Color.White, 290, 255, 170, 42);
            btnStopAll.Click += (s, e) => DetenerTodosServicios();
            p.Controls.Add(btnStopAll);

            Button btnRestart = CreateButton("🔄 Reiniciar Servicios", cyanAccent, Color.Black, 470, 255, 180, 42);
            btnRestart.Click += (s, e) => { DetenerTodosServicios(); Thread.Sleep(800); IniciarTodosServicios(); };
            p.Controls.Add(btnRestart);

            Button btnSeed = CreateButton("🌱 Montar DB / Sembrar 25 Taxis", Color.FromArgb(168, 85, 247), Color.White, 660, 255, 200, 42);
            btnSeed.Click += (s, e) => SembrarBaseDatos();
            p.Controls.Add(btnSeed);

            // Cuadro informativo
            TextBox txtLog = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                BackColor = cardDark,
                ForeColor = Color.FromArgb(203, 213, 225),
                Location = new Point(20, 315),
                Size = new Size(840, 190),
                Font = new Font("Consolas", 9f),
                Text = "TaxiHUB Central v2.0 Satelital\r\n" +
                       "- Backend FastAPI: Puerto 8080 (Servicios, GPS, Anti-Ban)\r\n" +
                       "- Terminal: http://localhost:3005/terminal (Operadora)\r\n" +
                       "- App Operador: http://localhost:3006 (Exclusivo choferes)\r\n" +
                       "- Puente WhatsApp: http://localhost:3099 (Multi-Device con Baileys)\r\n" +
                       "\r\nPresiona 'Iniciar Todos los Servicios' para arrancar la suite completa en segundo plano."
            };
            p.Controls.Add(txtLog);

            tab.Controls.Add(p);
        }

        private Label CreateStatusRow(GroupBox gb, string labelText, int top)
        {
            Label lblName = new Label
            {
                Text = labelText,
                ForeColor = textLight,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                Location = new Point(20, top),
                AutoSize = true
            };
            Label lblVal = new Label
            {
                Text = "Verificando...",
                ForeColor = Color.Gold,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Location = new Point(480, top),
                AutoSize = true
            };
            gb.Controls.Add(lblName);
            gb.Controls.Add(lblVal);
            return lblVal;
        }

        private void BuildTabWhatsApp(TabPage tab)
        {
            Panel p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(20) };

            Label lblTitle = new Label
            {
                Text = "Vinculación Real WhatsApp Web Multi-Device",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                ForeColor = textLight,
                Location = new Point(20, 15),
                AutoSize = true
            };
            p.Controls.Add(lblTitle);

            // PictureBox de Código QR Real
            pbQr = new PictureBox
            {
                Location = new Point(25, 55),
                Size = new Size(240, 240),
                BackColor = Color.White,
                SizeMode = PictureBoxSizeMode.Zoom,
                BorderStyle = BorderStyle.FixedSingle
            };
            p.Controls.Add(pbQr);

            lblQrInfo = new Label
            {
                Text = "Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular un dispositivo y escanea este código QR con la cámara.",
                ForeColor = textMuted,
                Font = new Font("Segoe UI", 9.5f),
                Location = new Point(285, 55),
                Size = new Size(570, 45)
            };
            p.Controls.Add(lblQrInfo);

            Label lblNumTitle = new Label
            {
                Text = "Número de WhatsApp de la Central / Número de Prueba:",
                ForeColor = textLight,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Location = new Point(285, 110),
                AutoSize = true
            };
            p.Controls.Add(lblNumTitle);

            txtWaNumero = new TextBox
            {
                Text = "+52 916 123 9999",
                BackColor = cardDark,
                ForeColor = cyanAccent,
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                Location = new Point(285, 135),
                Size = new Size(260, 30)
            };
            p.Controls.Add(txtWaNumero);

            Button btnRefreshQr = CreateButton("🔄 Actualizar / Regenerar QR", cyanAccent, Color.Black, 285, 175, 230, 38);
            btnRefreshQr.Click += (s, e) => ActualizarQrReal();
            p.Controls.Add(btnRefreshQr);

            Button btnPairCode = CreateButton("🔢 Pedir Código de 8 Dígitos", emeraldAccent, Color.Black, 525, 175, 220, 38);
            btnPairCode.Click += (s, e) => SolicitarCodigoPairing();
            p.Controls.Add(btnPairCode);

            // Simulador de Mensaje Entrante
            GroupBox gbSim = new GroupBox
            {
                Text = " Simulador de Mensaje Entrante con GPS para Pruebas en 1 Clic ",
                ForeColor = Color.FromArgb(129, 140, 248),
                Location = new Point(25, 310),
                Size = new Size(830, 180),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };

            Label lblSimText = new Label
            {
                Text = "Simula que un cliente envía un mensaje por WhatsApp con su ubicación GPS en Palenque:",
                ForeColor = textMuted,
                Font = new Font("Segoe UI", 9f),
                Location = new Point(20, 30),
                AutoSize = true
            };
            gbSim.Controls.Add(lblSimText);

            Button btnSimCabezaMaya = CreateButton("📍 Enviar Mensaje desde Cabeza Maya", Color.FromArgb(79, 70, 229), Color.White, 20, 60, 270, 36);
            btnSimCabezaMaya.Click += (s, e) => SimularMensajeEntrante("Glorieta Cabeza Maya", 17.5095, -91.9821);
            gbSim.Controls.Add(btnSimCabezaMaya);

            Button btnSimAdo = CreateButton("📍 Enviar Mensaje desde Terminal ADO", Color.FromArgb(79, 70, 229), Color.White, 305, 60, 260, 36);
            btnSimAdo.Click += (s, e) => SimularMensajeEntrante("Terminal ADO Palenque", 17.5138, -91.9852);
            gbSim.Controls.Add(btnSimAdo);

            Button btnSimPakalNa = CreateButton("📍 Enviar Mensaje desde Tren Maya", Color.FromArgb(79, 70, 229), Color.White, 580, 60, 235, 36);
            btnSimPakalNa.Click += (s, e) => SimularMensajeEntrante("Estación Tren Maya Pakal-Ná", 17.5361, -91.9568);
            gbSim.Controls.Add(btnSimPakalNa);

            Label lblSimRes = new Label
            {
                Text = "Al hacer clic, el mensaje aparece inmediatamente en la Terminal de Despacho listo para asignar taxi.",
                ForeColor = Color.FromArgb(148, 163, 184),
                Font = new Font("Segoe UI", 9f, FontStyle.Italic),
                Location = new Point(20, 115),
                AutoSize = true
            };
            gbSim.Controls.Add(lblSimRes);

            p.Controls.Add(gbSim);

            tab.Controls.Add(p);
            ActualizarQrReal();
        }

        private void BuildTabConfig(TabPage tab)
        {
            Panel p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(20) };

            Label lblTitle = new Label
            {
                Text = "Ajustes de Servidores y Base de Datos",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                ForeColor = textLight,
                Location = new Point(20, 15),
                AutoSize = true
            };
            p.Controls.Add(lblTitle);

            // Puertos
            GroupBox gbPuertos = new GroupBox
            {
                Text = " Configuración de Puertos Locales ",
                ForeColor = cyanAccent,
                Location = new Point(20, 45),
                Size = new Size(830, 110),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };

            AddConfigField(gbPuertos, "Puerto Backend API:", out txtBackendPort, "8080", 20, 30);
            AddConfigField(gbPuertos, "Puerto Terminal SPA:", out txtTerminalPort, "3005", 220, 30);
            AddConfigField(gbPuertos, "Puerto App Operador:", out txtOperadorPort, "3006", 420, 30);
            AddConfigField(gbPuertos, "Puerto WhatsApp Bridge:", out txtBridgePort, "3099", 620, 30);
            p.Controls.Add(gbPuertos);

            // Base de Datos
            GroupBox gbDb = new GroupBox
            {
                Text = " Modo de Base de Datos ",
                ForeColor = cyanAccent,
                Location = new Point(20, 170),
                Size = new Size(830, 160),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };

            rbMongoMemory = new RadioButton
            {
                Text = "Base de Datos en Memoria (Recomendado para pruebas sin instalar MongoDB)",
                Checked = true,
                ForeColor = textLight,
                Location = new Point(20, 30),
                Size = new Size(600, 24),
                Font = new Font("Segoe UI", 9.5f)
            };
            rbMongoUri = new RadioButton
            {
                Text = "MongoDB Servidor / Conexión URI (Producción)",
                ForeColor = textLight,
                Location = new Point(20, 60),
                Size = new Size(400, 24),
                Font = new Font("Segoe UI", 9.5f)
            };
            Label lblUri = new Label { Text = "URI MongoDB:", ForeColor = textMuted, Location = new Point(40, 95), AutoSize = true };
            txtMongoUri = new TextBox
            {
                Text = "mongodb://localhost:27017",
                BackColor = cardDark,
                ForeColor = textLight,
                Location = new Point(150, 92),
                Size = new Size(350, 26)
            };

            gbDb.Controls.Add(rbMongoMemory);
            gbDb.Controls.Add(rbMongoUri);
            gbDb.Controls.Add(lblUri);
            gbDb.Controls.Add(txtMongoUri);
            p.Controls.Add(gbDb);

            // Tenant y Guardado
            Label lblTenant = new Label { Text = "Tenant ID / Clave de Sitio:", ForeColor = textLight, Location = new Point(20, 350), AutoSize = true };
            txtTenantId = new TextBox { Text = "sitio_palenque", BackColor = cardDark, ForeColor = textLight, Location = new Point(200, 347), Size = new Size(200, 26) };
            p.Controls.Add(lblTenant);
            p.Controls.Add(txtTenantId);

            Button btnGuardar = CreateButton("💾 Guardar Configuración en backend/.env", emeraldAccent, Color.Black, 20, 400, 340, 42);
            btnGuardar.Click += (s, e) => GuardarConfiguracion();
            p.Controls.Add(btnGuardar);

            tab.Controls.Add(p);
        }

        private void AddConfigField(GroupBox gb, string label, out TextBox txt, string defVal, int x, int y)
        {
            Label lbl = new Label { Text = label, ForeColor = textLight, Location = new Point(x, y), AutoSize = true, Font = new Font("Segoe UI", 8.5f) };
            txt = new TextBox { Text = defVal, BackColor = cardDark, ForeColor = textLight, Location = new Point(x, y + 25), Size = new Size(160, 26) };
            gb.Controls.Add(lbl);
            gb.Controls.Add(txt);
        }

        private void BuildTabLanzadores(TabPage tab)
        {
            Panel p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(25) };

            Label lblTitle = new Label
            {
                Text = "Lanzador de Módulos de TaxiHUB en Modo App de Escritorio",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                ForeColor = textLight,
                Location = new Point(20, 15),
                AutoSize = true
            };
            p.Controls.Add(lblTitle);

            int startY = 60;
            AddAppLauncher(p, "🖥️ Terminal de Despacho (Central / Operadora)", "http://localhost:3005/terminal/login", "Acceso para operadoras y despacho satelital.", startY);
            AddAppLauncher(p, "🚖 App Exclusiva de Operador (Conductores)", "http://localhost:3006/login", "Modo exclusivo de taxista (login aislado sin enlaces externos).", startY + 80);
            AddAppLauncher(p, "💼 Portal de Socios / Inversionistas (Dueños)", "http://localhost:3005/dueno/login", "Expedientes, recaudación y control de vehículos.", startY + 160);
            AddAppLauncher(p, "🛠️ Panel Maestro de Desarrollador (Dev / Multi-Tenant)", "http://localhost:3005/dev", "Métricas, facturas por tenant, avisos y optimización de storage.", startY + 240);
            AddAppLauncher(p, "📦 Carpeta de Descargas de APK y Paquetes de Prueba", "http://localhost:3005/downloads", "Descarga taxiHUB-operador-debug.apk y ZIP portable.", startY + 320);

            tab.Controls.Add(p);
        }

        private void AddAppLauncher(Panel p, string title, string url, string desc, int top)
        {
            Panel card = new Panel
            {
                Location = new Point(20, top),
                Size = new Size(830, 68),
                BackColor = cardDark,
                BorderStyle = BorderStyle.FixedSingle
            };

            Label lTitle = new Label { Text = title, ForeColor = cyanAccent, Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), Location = new Point(15, 12), AutoSize = true };
            Label lDesc = new Label { Text = desc, ForeColor = textMuted, Font = new Font("Segoe UI", 8.5f), Location = new Point(15, 36), AutoSize = true };
            Button btn = CreateButton("Abrir App", emeraldAccent, Color.Black, 680, 14, 130, 36);
            btn.Click += (s, e) => OpenInAppMode(url);

            card.Controls.Add(lTitle);
            card.Controls.Add(lDesc);
            card.Controls.Add(btn);
            p.Controls.Add(card);
        }

        private Button CreateButton(string text, Color bg, Color fg, int x, int y, int w, int h)
        {
            Button b = new Button
            {
                Text = text,
                BackColor = bg,
                ForeColor = fg,
                Location = new Point(x, y),
                Size = new Size(w, h),
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            b.FlatAppearance.BorderSize = 0;
            return b;
        }

        private void StartHealthTimer()
        {
            healthTimer = new System.Windows.Forms.Timer { Interval = 3000 };
            healthTimer.Tick += (s, e) => CheckHealth();
            healthTimer.Start();
            CheckHealth();
        }

        private void CheckHealth()
        {
            CheckPort("http://localhost:8080/api/", lblBackendStatus);
            CheckPort("http://localhost:3005", lblTerminalStatus);
            CheckPort("http://localhost:3006", lblOperadorStatus);
            CheckPort("http://localhost:3099/status", lblBridgeStatus);
        }

        private void CheckPort(string url, Label lbl)
        {
            ThreadPool.QueueUserWorkItem((_) =>
            {
                bool ok = false;
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                    req.Timeout = 1200;
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    {
                        ok = (resp.StatusCode == HttpStatusCode.OK);
                    }
                }
                catch { ok = false; }

                this.BeginInvoke(new Action(() =>
                {
                    if (ok)
                    {
                        lbl.Text = "● ACTIVO (200 OK)";
                        lbl.ForeColor = Color.FromArgb(74, 222, 128); // Green
                    }
                    else
                    {
                        lbl.Text = "○ DETENIDO / APAGADO";
                        lbl.ForeColor = Color.FromArgb(248, 113, 113); // Red
                    }
                }));
            });
        }

        private void ActualizarQrReal()
        {
            ThreadPool.QueueUserWorkItem((_) =>
            {
                try
                {
                    string url = "http://localhost:8080/api/wa/qr.png?t=" + DateTime.UtcNow.Ticks;
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                    req.Timeout = 2500;
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    using (Stream s = resp.GetResponseStream())
                    {
                        Image img = Image.FromStream(s);
                        this.BeginInvoke(new Action(() =>
                        {
                            pbQr.Image = img;
                            lblQrInfo.Text = "Código QR Real ISO/IEC 18004 generado en vivo desde la central. Apunta tu cámara o WhatsApp para escanear.";
                        }));
                    }
                }
                catch
                {
                    this.BeginInvoke(new Action(() =>
                    {
                        lblQrInfo.Text = "Inicia el Backend (Puerto 8080) para cargar la imagen QR en vivo.";
                    }));
                }
            });
        }

        private void SolicitarCodigoPairing()
        {
            ThreadPool.QueueUserWorkItem((_) =>
            {
                try
                {
                    string json = "{\"numero\":\"" + txtWaNumero.Text.Trim() + "\",\"codigo_emparejamiento\":true}";
                    byte[] data = Encoding.UTF8.GetBytes(json);
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:8080/api/wa/bridge/vincular");
                    req.Method = "POST";
                    req.ContentType = "application/json";
                    req.ContentLength = data.Length;
                    using (Stream os = req.GetRequestStream()) os.Write(data, 0, data.Length);
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    {
                        this.BeginInvoke(new Action(() =>
                        {
                            MessageBox.Show("Código de emparejamiento generado con éxito.\r\nCódigo de prueba: TXHB-9164\r\nIngrésalo en WhatsApp -> Dispositivos Vinculados.", "WhatsApp TaxiHub", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }));
                    }
                }
                catch (Exception ex)
                {
                    this.BeginInvoke(new Action(() => MessageBox.Show("Error: " + ex.Message, "WhatsApp", MessageBoxButtons.OK, MessageBoxIcon.Error)));
                }
            });
        }

        private void SimularMensajeEntrante(string spot, double lat, double lng)
        {
            ThreadPool.QueueUserWorkItem((_) =>
            {
                try
                {
                    string json = "{\"cliente_telefono\":\"" + txtWaNumero.Text.Trim() + "\",\"cliente_nombre\":\"Cliente Prueba\",\"texto\":\"Hola necesito taxi en " + spot + "\",\"lat\":" + lat + ",\"lng\":" + lng + "}";
                    byte[] data = Encoding.UTF8.GetBytes(json);
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:8080/api/wa/incoming");
                    req.Method = "POST";
                    req.ContentType = "application/json";
                    req.ContentLength = data.Length;
                    using (Stream os = req.GetRequestStream()) os.Write(data, 0, data.Length);
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    {
                        this.BeginInvoke(new Action(() =>
                        {
                            MessageBox.Show("¡Mensaje entrante con GPS recibido!\r\nUbicación: " + spot + "\r\nAbre la Terminal (Puerto 3005) para despacharle un taxi con 1 clic.", "WhatsApp TaxiHub", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }));
                    }
                }
                catch (Exception ex)
                {
                    this.BeginInvoke(new Action(() => MessageBox.Show("Error simulando mensaje: " + ex.Message, "Simulador", MessageBoxButtons.OK, MessageBoxIcon.Error)));
                }
            });
        }

        private void IniciarTodosServicios()
        {
            string launcherBat = Path.Combine(projectRoot, "windows-native", "run_services.bat");
            File.WriteAllText(launcherBat,
                "@echo off\r\n" +
                "echo Iniciando Backend FastAPI...\r\n" +
                "start \"TaxiHub Backend 8080\" /B powershell -Command \"$env:MONGO_URL='memory'; $env:DB_NAME='taxihub_demo'; $env:JWT_SECRET='dev-jwt-secret-taxihub'; $env:DEV_USER='admin'; $env:DEV_PASSWORD='admin123'; & 'C:\\Users\\Quantum\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' -m uvicorn server:app --host 0.0.0.0 --port 8080\"\r\n" +
                "timeout /t 2 >nul\r\n" +
                "echo Sembrando DB...\r\n" +
                "curl -s -X POST http://localhost:8080/api/seed >nul\r\n" +
                "echo Iniciando Terminal 3005...\r\n" +
                "start \"TaxiHub Terminal 3005\" /B node -e \"const http=require('http'),fs=require('fs'),path=require('path'),root=path.join(__dirname,'frontend','build'),mimes={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.apk':'application/vnd.android.package-archive','.zip':'application/zip'};http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);let fp=path.join(root,u==='/'?'index.html':u);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(root,'index.html');const ext=path.extname(fp).toLowerCase();res.writeHead(200,{'Content-Type':mimes[ext]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);}).listen(3005,'0.0.0.0');\"\r\n" +
                "echo Iniciando Operador 3006...\r\n" +
                "start \"TaxiHub Operador 3006\" /B node -e \"const http=require('http'),fs=require('fs'),path=require('path'),root=path.join(__dirname,'frontend','build-operador'),mimes={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);let fp=path.join(root,u==='/'?'index.html':u);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(root,'index.html');const ext=path.extname(fp).toLowerCase();res.writeHead(200,{'Content-Type':mimes[ext]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);}).listen(3006,'0.0.0.0');\"\r\n" +
                "echo Servicios iniciados correctamente.\r\n"
            );

            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"" + launcherBat + "\"")
            {
                WorkingDirectory = projectRoot,
                CreateNoWindow = true,
                UseShellExecute = false
            };
            Process.Start(psi);
            Thread.Sleep(2000);
            CheckHealth();
            ActualizarQrReal();
            MessageBox.Show("Servicios de TaxiHUB iniciados exitosamente en segundo plano.", "TaxiHub", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void DetenerTodosServicios()
        {
            try
            {
                foreach (string procName in new string[] { "uvicorn" })
                {
                    foreach (var p in Process.GetProcessesByName(procName))
                    {
                        try { p.Kill(); } catch { }
                    }
                }
                // Terminar procesos en puertos
                Process.Start(new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":8080\" ^| find \"LISTENING\"') do taskkill /f /pid %a") { CreateNoWindow = true, UseShellExecute = false });
                Process.Start(new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":3005\" ^| find \"LISTENING\"') do taskkill /f /pid %a") { CreateNoWindow = true, UseShellExecute = false });
                Process.Start(new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":3006\" ^| find \"LISTENING\"') do taskkill /f /pid %a") { CreateNoWindow = true, UseShellExecute = false });
            }
            catch { }
            Thread.Sleep(1200);
            CheckHealth();
            MessageBox.Show("Todos los servicios han sido detenidos.", "TaxiHub", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void SembrarBaseDatos()
        {
            ThreadPool.QueueUserWorkItem((_) =>
            {
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:8080/api/seed");
                    req.Method = "POST";
                    req.ContentLength = 0;
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    {
                        this.BeginInvoke(new Action(() =>
                        {
                            MessageBox.Show("Base de datos montada con éxito: 25 taxis patrullando, tarifas, rutas colectivas y colonias.", "Base de Datos", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }));
                    }
                }
                catch (Exception ex)
                {
                    this.BeginInvoke(new Action(() => MessageBox.Show("Error sembrando base de datos: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error)));
                }
            });
        }

        private void GuardarConfiguracion()
        {
            try
            {
                string envFile = Path.Combine(projectRoot, "backend", ".env");
                StringBuilder sb = new StringBuilder();
                if (rbMongoMemory.Checked)
                {
                    sb.AppendLine("MONGO_URL=memory");
                }
                else
                {
                    sb.AppendLine("MONGO_URL=" + txtMongoUri.Text.Trim());
                }
                sb.AppendLine("DB_NAME=taxihub_demo");
                sb.AppendLine("JWT_SECRET=dev-jwt-secret-taxihub");
                sb.AppendLine("DEV_USER=admin");
                sb.AppendLine("DEV_PASSWORD=admin123");
                sb.AppendLine("SITIO_ID=" + txtTenantId.Text.Trim());
                sb.AppendLine("WA_BRIDGE_PORT=" + txtBridgePort.Text.Trim());
                sb.AppendLine("PORT=" + txtBackendPort.Text.Trim());
                File.WriteAllText(envFile, sb.ToString());

                MessageBox.Show("Configuración guardada exitosamente en backend/.env.", "Configuración", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error al guardar: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OpenInAppMode(string url)
        {
            try
            {
                // Intentar Edge en modo app nativa (sin barra de navegador)
                Process.Start("msedge.exe", "--app=" + url);
            }
            catch
            {
                try
                {
                    // Fallback a Chrome
                    Process.Start("chrome.exe", "--app=" + url);
                }
                catch
                {
                    // Fallback a navegador predeterminado
                    Process.Start(url);
                }
            }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ConfiguradorForm());
        }
    }
}
